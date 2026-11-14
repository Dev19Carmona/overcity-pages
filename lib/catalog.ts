import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_PRICE,
  MAX_PRODUCTS,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_NAME,
  MAX_STOCK,
  MAX_TITLE,
  MAX_URL,
} from "@/lib/content-limits";
import { isBlobUrl } from "@/lib/content";
import {
  CATALOG_COLORS,
  CATALOG_CURRENCIES,
  emptyStock,
  normalizeText,
  sizesFor,
  type Catalog,
  type CatalogCategory,
  type CatalogColor,
  type CatalogCurrency,
  type CatalogImage,
  type CatalogProduct,
} from "@/lib/catalog-shared";
import { getRedis } from "@/lib/redis";

export { CATALOG_CURRENCIES, formatPrice } from "@/lib/catalog-shared";
export type {
  Catalog,
  CatalogCategory,
  CatalogColor,
  CatalogCurrency,
  CatalogImage,
  CatalogProduct,
} from "@/lib/catalog-shared";

export const CATALOG_KEY = "overcity:catalog:v2";
// Catálogo de la SPEC 06 (con buyUrl y fotos sueltas). Solo se lee, nunca se modifica.
const LEGACY_CATALOG_KEY = "overcity:catalog:v1";

export const DEFAULT_CATALOG: Catalog = {
  title: "Catálogo",
  currency: "COP",
  categories: [],
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

    const { categories, products } = input;
    if (!Array.isArray(categories)) throw new Error("Las categorías deben ser una lista.");
    if (categories.length > MAX_CATEGORIES) {
      throw new Error(`No puede haber más de ${MAX_CATEGORIES} categorías.`);
    }
    if (!Array.isArray(products)) throw new Error("Los productos deben ser una lista.");
    if (products.length > MAX_PRODUCTS) {
      throw new Error(`No puede haber más de ${MAX_PRODUCTS} productos.`);
    }

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

      const { colors } = item;
      if (!Array.isArray(colors) || colors.length < 1) {
        throw new Error(`El ${label} necesita al menos un color.`);
      }
      if (colors.length > CATALOG_COLORS.length) {
        throw new Error(`El ${label} tiene demasiados colores.`);
      }
      const validColors = colors.map((color): CatalogColor => {
        if (!CATALOG_COLORS.includes(color as CatalogColor)) {
          throw new Error(`El color "${String(color)}" del ${label} no está en la paleta.`);
        }
        return color as CatalogColor;
      });
      if (new Set(validColors).size !== validColors.length) {
        throw new Error(`El ${label} repite un color.`);
      }

      const { images } = item;
      if (!Array.isArray(images) || images.length < 1) {
        throw new Error(`El ${label} necesita al menos una imagen.`);
      }
      if (images.length > MAX_PRODUCT_IMAGES) {
        throw new Error(`El ${label} no puede tener más de ${MAX_PRODUCT_IMAGES} imágenes.`);
      }
      const validImages = images.map((image, imageIndex): CatalogImage => {
        if (!isRecord(image) || typeof image.url !== "string" || !image.url) {
          throw new Error(`La imagen ${imageIndex + 1} del ${label} es inválida.`);
        }
        if (image.url.length > MAX_URL) {
          throw new Error(`La URL de la imagen ${imageIndex + 1} del ${label} es demasiado larga.`);
        }
        if (!isBlobUrl(image.url)) {
          throw new Error(`La imagen ${imageIndex + 1} del ${label} debe estar en Vercel Blob.`);
        }
        if (!validColors.includes(image.color as CatalogColor)) {
          throw new Error(
            `El color de la imagen ${imageIndex + 1} del ${label} no es uno de los colores del producto.`,
          );
        }
        return { url: image.url, color: image.color as CatalogColor };
      });

      const categoryId = item.categoryId ?? null;
      if (categoryId !== null && (typeof categoryId !== "string" || !categoryIds.has(categoryId))) {
        throw new Error(`La categoría del ${label} no existe.`);
      }
      if (typeof item.visible !== "boolean") {
        throw new Error(`La visibilidad del ${label} es inválida.`);
      }

      const sizes = sizesFor(categoryId === null ? null : categoryById.get(categoryId));
      const { stock } = item;
      if (!isRecord(stock)) throw new Error(`El stock del ${label} es inválido.`);
      if (Object.keys(stock).length !== sizes.length || !sizes.every((size) => size in stock)) {
        throw new Error(`El stock del ${label} debe tener las tallas ${sizes.join(", ")}.`);
      }
      const validStock = Object.fromEntries(
        sizes.map((size) => {
          const units = stock[size];
          if (
            typeof units !== "number" ||
            !Number.isInteger(units) ||
            units < 0 ||
            units > MAX_STOCK
          ) {
            throw new Error(
              `El stock de la talla ${size} del ${label} debe ser un entero entre 0 y ${MAX_STOCK}.`,
            );
          }
          return [size, units];
        }),
      );

      return {
        id,
        name: text(item.name, `El nombre del ${label}`, MAX_PRODUCT_NAME),
        description:
          item.description === undefined || item.description === null
            ? ""
            : text(item.description, `La descripción del ${label}`, MAX_PRODUCT_DESCRIPTION, true),
        price: price(item.price, `El precio del ${label}`),
        images: validImages,
        categoryId,
        visible: item.visible,
        colors: validColors,
        stock: validStock,
      };
    });

    return {
      ok: true,
      catalog: {
        title: text(input.title, "El título del catálogo", MAX_TITLE),
        currency: currency as CatalogCurrency,
        categories: validCategories,
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
        stock: emptyStock(sizesFor(null)),
      };
    }),
  };
}

// Lee v2; si no existe, lee v1 y lo convierte en memoria (v1 nunca se modifica).
async function loadStored(redis: NonNullable<ReturnType<typeof getRedis>>): Promise<Catalog> {
  const stored = await redis.get<unknown>(CATALOG_KEY);
  if (stored !== null) {
    const result = validateCatalog(stored);
    return result.ok ? result.catalog : DEFAULT_CATALOG;
  }
  const legacy = await redis.get<unknown>(LEGACY_CATALOG_KEY);
  if (legacy === null) return DEFAULT_CATALOG;
  const result = validateCatalog(migrateLegacyCatalog(legacy));
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
  return new Set(catalog.products.flatMap((product) => product.images.map((image) => image.url)));
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
