import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_COLORS,
  MAX_COLOR_NAME,
  MAX_DESIGN_COLORS,
  MAX_DESIGNS,
  MAX_DESIGN_NAME,
  MAX_PRICE,
  MAX_PRODUCTS,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PRODUCT_NAME,
  MAX_STOCK,
  MAX_TITLE,
  MAX_URL,
} from "@/lib/content-limits";
import { isBlobUrl } from "@/lib/content";
import {
  CATALOG_CURRENCIES,
  COLOR_HEX_PATTERN,
  DEFAULT_COLORS,
  emptyStock,
  normalizeText,
  sizesFor,
  type Catalog,
  type CatalogCategory,
  type CatalogColor,
  type CatalogColorDef,
  type CatalogCurrency,
  type CatalogDesign,
  type CatalogProduct,
  type DesignStock,
} from "@/lib/catalog-shared";
import { getRedis } from "@/lib/redis";

export { CATALOG_CURRENCIES, formatPrice } from "@/lib/catalog-shared";
export type {
  Catalog,
  CatalogCategory,
  CatalogColor,
  CatalogColorDef,
  CatalogCurrency,
  CatalogDesign,
  CatalogProduct,
} from "@/lib/catalog-shared";

export const CATALOG_KEY = "overcity:catalog:v2";
// Catálogo de la SPEC 06 (con buyUrl y fotos sueltas). Solo se lee, nunca se modifica.
const LEGACY_CATALOG_KEY = "overcity:catalog:v1";

export const DEFAULT_CATALOG: Catalog = {
  title: "Catálogo",
  currency: "COP",
  whatsapp: "",
  freeShippingFrom: null,
  categories: [],
  colors: DEFAULT_COLORS,
  products: [],
};

export type CatalogValidation =
  | { ok: true; catalog: Catalog }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} debe ser texto.`);
  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) throw new Error(`${field} no puede estar vacío.`);
  if (trimmed.length > max) {
    throw new Error(`${field} no puede superar ${max} caracteres.`);
  }
  return trimmed;
}

function price(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_PRICE) {
    throw new Error(`${field} debe ser un número entero entre 0 y ${MAX_PRICE}.`);
  }
  return value;
}

export function validateCatalog(input: unknown): CatalogValidation {
  try {
    if (!isRecord(input)) throw new Error("Catálogo inválido.");

    const currency = input.currency;
    if (!CATALOG_CURRENCIES.includes(currency as CatalogCurrency)) {
      throw new Error("La moneda no está en la lista permitida.");
    }

    const whatsapp = input.whatsapp ?? "";
    if (typeof whatsapp !== "string" || !/^(\d{8,15})?$/.test(whatsapp)) {
      throw new Error("El número de WhatsApp debe tener entre 8 y 15 dígitos, con código de país.");
    }
    const freeShippingFrom = input.freeShippingFrom ?? null;
    if (
      freeShippingFrom !== null &&
      (typeof freeShippingFrom !== "number" ||
        !Number.isInteger(freeShippingFrom) ||
        freeShippingFrom < 1 ||
        freeShippingFrom > MAX_PRICE)
    ) {
      throw new Error(`El envío gratis debe ser un entero entre 1 y ${MAX_PRICE}, o quedar vacío.`);
    }

    const { categories, products } = input;
    if (!Array.isArray(categories)) throw new Error("Las categorías deben ser una lista.");
    if (categories.length > MAX_CATEGORIES) {
      throw new Error(`No puede haber más de ${MAX_CATEGORIES} categorías.`);
    }
    if (!Array.isArray(products)) throw new Error("Los productos deben ser una lista.");
    if (products.length > MAX_PRODUCTS) {
      throw new Error(`No puede haber más de ${MAX_PRODUCTS} productos.`);
    }

    // SPEC 11: sin `colors` se usa la semilla (catálogos guardados antes de la SPEC 11 y v1).
    const rawColors = input.colors === undefined ? DEFAULT_COLORS : input.colors;
    if (!Array.isArray(rawColors)) throw new Error("Los colores deben ser una lista.");
    if (rawColors.length > MAX_COLORS) throw new Error(`No puede haber más de ${MAX_COLORS} colores.`);
    const colorNames = new Set<string>();
    const validColorDefs = rawColors.map((item, index): CatalogColorDef => {
      if (!isRecord(item)) throw new Error(`Color ${index + 1} inválido.`);
      const name = text(item.name, `El nombre del color ${index + 1}`, MAX_COLOR_NAME);
      const key = normalizeText(name);
      if (colorNames.has(key)) throw new Error(`Ya existe el color "${name}".`);
      colorNames.add(key);
      if (typeof item.hex !== "string" || !COLOR_HEX_PATTERN.test(item.hex)) {
        throw new Error(`El color "${name}" necesita un hex con formato #RRGGBB.`);
      }
      if (typeof item.hidden !== "boolean") {
        throw new Error(`El estado oculto del color "${name}" es inválido.`);
      }
      return { name, hex: item.hex, hidden: item.hidden };
    });
    const colorList = new Set(validColorDefs.map((color) => color.name));

    const categoryIds = new Set<string>();
    const categoryNames = new Set<string>();
    const validCategories = categories.map((item, index): CatalogCategory => {
      if (!isRecord(item)) throw new Error(`Categoría ${index + 1} inválida.`);
      const id = text(item.id, `Id de la categoría ${index + 1}`, MAX_URL);
      if (categoryIds.has(id)) throw new Error(`Id de categoría repetido: ${id}.`);
      categoryIds.add(id);
      const name = text(item.name, `El nombre de la categoría ${index + 1}`, MAX_CATEGORY_NAME);
      const key = normalizeText(name);
      if (categoryNames.has(key)) throw new Error(`Ya existe la categoría "${name}".`);
      categoryNames.add(key);
      if (typeof item.oneSize !== "boolean") {
        throw new Error(`La talla única de la categoría ${index + 1} es inválida.`);
      }
      return { id, name, oneSize: item.oneSize };
    });
    const categoryById = new Map(validCategories.map((category) => [category.id, category]));

    const productIds = new Set<string>();
    const validProducts = products.map((item, index): CatalogProduct => {
      const label = `producto ${index + 1}`;
      if (!isRecord(item)) throw new Error(`Producto ${index + 1} inválido.`);
      const id = text(item.id, `Id del ${label}`, MAX_URL);
      if (productIds.has(id)) throw new Error(`Id de producto repetido: ${id}.`);
      productIds.add(id);

      const categoryId = item.categoryId ?? null;
      if (categoryId !== null && (typeof categoryId !== "string" || !categoryIds.has(categoryId))) {
        throw new Error(`La categoría del ${label} no existe.`);
      }
      if (typeof item.visible !== "boolean") {
        throw new Error(`La visibilidad del ${label} es inválida.`);
      }
      const sizes = sizesFor(categoryId === null ? null : categoryById.get(categoryId));

      const { designs } = item;
      if (!Array.isArray(designs) || designs.length < 1) {
        throw new Error(`El ${label} necesita al menos un diseño.`);
      }
      if (designs.length > MAX_DESIGNS) {
        throw new Error(`El ${label} no puede tener más de ${MAX_DESIGNS} diseños.`);
      }
      const designIds = new Set<string>();
      const designNames = new Set<string>();
      const validDesigns = designs.map((design, designIndex): CatalogDesign => {
        const dLabel = `diseño ${designIndex + 1} del ${label}`;
        if (!isRecord(design)) throw new Error(`El ${dLabel} es inválido.`);
        const designId = text(design.id, `El id del ${dLabel}`, MAX_URL);
        if (designIds.has(designId)) throw new Error(`Id de diseño repetido en el ${label}.`);
        designIds.add(designId);
        const designName = text(design.name, `El nombre del ${dLabel}`, MAX_DESIGN_NAME);
        const nameKey = normalizeText(designName);
        if (designNames.has(nameKey)) {
          throw new Error(`El ${label} ya tiene un diseño llamado "${designName}".`);
        }
        designNames.add(nameKey);

        const { image } = design;
        if (typeof image !== "string" || !image) {
          throw new Error(`El ${dLabel} necesita una foto.`);
        }
        if (image.length > MAX_URL) throw new Error(`La URL de la foto del ${dLabel} es demasiado larga.`);
        if (!isBlobUrl(image)) throw new Error(`La foto del ${dLabel} debe estar en Vercel Blob.`);

        const { colors } = design;
        if (!Array.isArray(colors) || colors.length < 1) {
          throw new Error(`El ${dLabel} necesita al menos un color.`);
        }
        if (colors.length > MAX_DESIGN_COLORS) {
          throw new Error(`El ${dLabel} tiene demasiados colores.`);
        }
        const validColors = colors.map((color): CatalogColor => {
          if (typeof color !== "string" || !colorList.has(color)) {
            throw new Error(`El color "${String(color)}" del ${dLabel} no existe en la lista de colores.`);
          }
          return color as CatalogColor;
        });
        if (new Set(validColors).size !== validColors.length) {
          throw new Error(`El ${dLabel} repite un color.`);
        }

        const { stock } = design;
        if (!isRecord(stock)) throw new Error(`El stock del ${dLabel} es inválido.`);
        if (
          Object.keys(stock).length !== validColors.length ||
          !validColors.every((color) => color in stock)
        ) {
          throw new Error(`El stock del ${dLabel} debe tener los colores ${validColors.join(", ")}.`);
        }
        const validStock: DesignStock = Object.fromEntries(
          validColors.map((color) => {
            const row = stock[color];
            if (!isRecord(row)) throw new Error(`El stock del color ${color} del ${dLabel} es inválido.`);
            if (Object.keys(row).length !== sizes.length || !sizes.every((size) => size in row)) {
              throw new Error(
                `El stock del color ${color} del ${dLabel} debe tener las tallas ${sizes.join(", ")}.`,
              );
            }
            return [
              color,
              Object.fromEntries(
                sizes.map((size) => {
                  const units = row[size];
                  if (
                    typeof units !== "number" ||
                    !Number.isInteger(units) ||
                    units < 0 ||
                    units > MAX_STOCK
                  ) {
                    throw new Error(
                      `El stock de ${color}, talla ${size}, del ${dLabel} debe ser un entero entre 0 y ${MAX_STOCK}.`,
                    );
                  }
                  return [size, units];
                }),
              ),
            ];
          }),
        );
        return { id: designId, name: designName, image, colors: validColors, stock: validStock };
      });

      return {
        id,
        name: text(item.name, `El nombre del ${label}`, MAX_PRODUCT_NAME),
        description:
          item.description === undefined || item.description === null
            ? ""
            : text(item.description, `La descripción del ${label}`, MAX_PRODUCT_DESCRIPTION, true),
        price: price(item.price, `El precio del ${label}`),
        categoryId,
        visible: item.visible,
        designs: validDesigns,
      };
    });

    return {
      ok: true,
      catalog: {
        title: text(input.title, "El título del catálogo", MAX_TITLE),
        currency: currency as CatalogCurrency,
        whatsapp,
        freeShippingFrom,
        categories: validCategories,
        colors: validColorDefs,
        products: validProducts,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Catálogo inválido.",
    };
  }
}

// Convierte el catálogo v1 (SPEC 06) a la forma v2: color "Negro", stock en 0 y sin buyUrl.
function migrateLegacyCatalog(stored: unknown): unknown {
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
function migrateDesignsShape(stored: unknown): unknown {
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

// Lee v2; si no existe, lee v1 y lo convierte en memoria (v1 nunca se modifica).
async function loadStored(redis: NonNullable<ReturnType<typeof getRedis>>): Promise<Catalog> {
  const stored = await redis.get<unknown>(CATALOG_KEY);
  if (stored !== null) {
    const result = validateCatalog(migrateDesignsShape(stored));
    return result.ok ? result.catalog : DEFAULT_CATALOG;
  }
  const legacy = await redis.get<unknown>(LEGACY_CATALOG_KEY);
  if (legacy === null) return DEFAULT_CATALOG;
  const result = validateCatalog(migrateDesignsShape(migrateLegacyCatalog(legacy)));
  return result.ok ? result.catalog : DEFAULT_CATALOG;
}

async function readCatalog(): Promise<{ catalog: Catalog; failed: boolean }> {
  const redis = getRedis();
  if (!redis) return { catalog: DEFAULT_CATALOG, failed: false };

  try {
    return { catalog: await loadStored(redis), failed: false };
  } catch {
    return { catalog: DEFAULT_CATALOG, failed: true };
  }
}

// Catálogo guardado ahora mismo; propaga los errores de Redis para no sobrescribir con el valor por defecto.
export async function getStoredCatalog(): Promise<Catalog> {
  const redis = getRedis();
  if (!redis) throw new Error("El almacenamiento no está configurado.");
  return loadStored(redis);
}

// URLs de Blob que usa el catálogo; sirve para borrar las que quedan sin uso.
export function catalogImageUrls(catalog: Catalog): Set<string> {
  return new Set(catalog.products.flatMap((product) => product.designs.map((design) => design.image)));
}

// Sin caché y con todos los productos, para el panel.
export async function getCatalog(): Promise<Catalog> {
  return (await readCatalog()).catalog;
}

// Con caché y etiqueta "catalog": solo productos visibles.
export async function getPublicCatalog(): Promise<Catalog> {
  "use cache";
  cacheTag("catalog");

  const { catalog, failed } = await readCatalog();
  if (failed) cacheLife("minutes");
  else cacheLife("hours");
  return { ...catalog, products: catalog.products.filter((product) => product.visible) };
}
