// Conversiones de las formas anteriores del catálogo (v1 de la SPEC 06 y las de las SPEC 09 y 10)
// a la forma actual. Sin "server-only": las usa el script de migración a Supabase (SPEC 12) y,
// mientras el catálogo siga en Redis, lib/catalog.ts.
import { emptyStock, sizesFor } from "@/lib/catalog-shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Convierte el catálogo v1 (SPEC 06) a la forma v2: color "Negro", stock en 0 y sin buyUrl.
export function migrateLegacyCatalog(stored: unknown): unknown {
  if (!isRecord(stored)) return stored;
  const categories = Array.isArray(stored.categories) ? stored.categories : [];
  const products = Array.isArray(stored.products) ? stored.products : [];
  return {
    ...stored,
    categories: categories.map((category) =>
      isRecord(category) ? { ...category, oneSize: false } : category,
    ),
    products: products.map((product) => {
      if (!isRecord(product)) return product;
      const { buyUrl, images, ...rest } = product;
      void buyUrl;
      return {
        ...rest,
        colors: ["Negro"],
        images: Array.isArray(images) ? images.map((url) => ({ url, color: "Negro" })) : images,
        stock: emptyStock(["Negro"], sizesFor(null)),
      };
    }),
  };
}

// SPEC 09: el stock v2 anterior era un número por talla. Se convierte en memoria a stock por color
// y talla: cada talla pasa al primer color y los demás quedan en 0 (el total no cambia).
function migrateStockShape(product: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(product.stock)) return product;
  const { stock } = product;
  if (!Object.values(stock).some((value) => typeof value === "number")) return product;
  const colors = Array.isArray(product.colors) ? product.colors : [];
  if (colors.length === 0) return product;
  const zero = Object.fromEntries(Object.keys(stock).map((size) => [size, 0]));
  return {
    ...product,
    stock: Object.fromEntries(
      colors.map((color, index) => [String(color), index === 0 ? stock : { ...zero }]),
    ),
  };
}

// SPEC 10: un producto sin `designs` y con `images` (forma de la SPEC 09) se convierte en memoria:
// cada imagen es un diseño "Diseño N" con todos los colores del producto; el stock completo va al
// primer diseño y los demás quedan en 0. La detección es por producto; el primer guardado escribe la forma nueva.
export function migrateDesignsShape(stored: unknown): unknown {
  if (!isRecord(stored) || !Array.isArray(stored.products)) return stored;
  return {
    ...stored,
    products: stored.products.map((raw) => {
      if (!isRecord(raw) || "designs" in raw || !Array.isArray(raw.images)) return raw;
      const product = migrateStockShape(raw);
      const { images, colors, stock, ...rest } = product;
      const productColors = Array.isArray(colors) ? (colors as unknown[]).map(String) : [];
      const firstRow = isRecord(stock) ? Object.values(stock).find(isRecord) : undefined;
      const sizes = firstRow ? Object.keys(firstRow) : [];
      return {
        ...rest,
        designs: (images as unknown[]).map((image, index) => ({
          id: `diseno-${index + 1}`, // estable entre lecturas hasta el primer guardado
          name: `Diseño ${index + 1}`,
          image: isRecord(image) ? image.url : image,
          colors: productColors,
          stock: index === 0 && isRecord(stock) ? stock : emptyStock(productColors, sizes),
        })),
      };
    }),
  };
}

