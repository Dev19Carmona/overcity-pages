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
  MAX_TITLE,
  MAX_URL,
} from "@/lib/content-limits";
import { isBlobUrl } from "@/lib/content";
import {
  CATALOG_CURRENCIES,
  type Catalog,
  type CatalogCategory,
  type CatalogCurrency,
  type CatalogProduct,
} from "@/lib/catalog-shared";
import { getRedis } from "@/lib/redis";

export { CATALOG_CURRENCIES, formatPrice } from "@/lib/catalog-shared";
export type {
  Catalog,
  CatalogCategory,
  CatalogCurrency,
  CatalogProduct,
} from "@/lib/catalog-shared";

export const CATALOG_KEY = "overcity:catalog:v1";

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

function buyUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const url = text(value, field, MAX_URL);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${field} no es una URL válida.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${field} debe empezar por http:// o https://.`);
  }
  return url;
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
    const validCategories = categories.map((item, index): CatalogCategory => {
      if (!isRecord(item)) throw new Error(`Categoría ${index + 1} inválida.`);
      const id = text(item.id, `Id de la categoría ${index + 1}`, MAX_URL);
      if (categoryIds.has(id)) throw new Error(`Id de categoría repetido: ${id}.`);
      categoryIds.add(id);
      return { id, name: text(item.name, `El nombre de la categoría ${index + 1}`, MAX_CATEGORY_NAME) };
    });

    const productIds = new Set<string>();
    const validProducts = products.map((item, index): CatalogProduct => {
      const label = `producto ${index + 1}`;
      if (!isRecord(item)) throw new Error(`Producto ${index + 1} inválido.`);
      const id = text(item.id, `Id del ${label}`, MAX_URL);
      if (productIds.has(id)) throw new Error(`Id de producto repetido: ${id}.`);
      productIds.add(id);

      const { images } = item;
      if (!Array.isArray(images) || images.length < 1) {
        throw new Error(`El ${label} necesita al menos una imagen.`);
      }
      if (images.length > MAX_PRODUCT_IMAGES) {
        throw new Error(`El ${label} no puede tener más de ${MAX_PRODUCT_IMAGES} imágenes.`);
      }
      const validImages = images.map((url, imageIndex) => {
        if (typeof url !== "string" || !url) {
          throw new Error(`La imagen ${imageIndex + 1} del ${label} es inválida.`);
        }
        if (url.length > MAX_URL) {
          throw new Error(`La URL de la imagen ${imageIndex + 1} del ${label} es demasiado larga.`);
        }
        if (!isBlobUrl(url)) {
          throw new Error(`La imagen ${imageIndex + 1} del ${label} debe estar en Vercel Blob.`);
        }
        return url;
      });

      const categoryId = item.categoryId ?? null;
      if (categoryId !== null && (typeof categoryId !== "string" || !categoryIds.has(categoryId))) {
        throw new Error(`La categoría del ${label} no existe.`);
      }
      if (typeof item.visible !== "boolean") {
        throw new Error(`La visibilidad del ${label} es inválida.`);
      }

      return {
        id,
        name: text(item.name, `El nombre del ${label}`, MAX_PRODUCT_NAME),
        description:
          item.description === undefined || item.description === null
            ? ""
            : text(item.description, `La descripción del ${label}`, MAX_PRODUCT_DESCRIPTION, true),
        price: price(item.price, `El precio del ${label}`),
        buyUrl: buyUrl(item.buyUrl, `El link de compra del ${label}`),
        images: validImages,
        categoryId,
        visible: item.visible,
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

async function readCatalog(): Promise<{ catalog: Catalog; failed: boolean }> {
  const redis = getRedis();
  if (!redis) return { catalog: DEFAULT_CATALOG, failed: false };

  try {
    const stored = await redis.get<unknown>(CATALOG_KEY);
    if (stored === null) return { catalog: DEFAULT_CATALOG, failed: false };
    const result = validateCatalog(stored);
    return { catalog: result.ok ? result.catalog : DEFAULT_CATALOG, failed: false };
  } catch {
    return { catalog: DEFAULT_CATALOG, failed: true };
  }
}

// Catálogo guardado ahora mismo; propaga los errores de Redis para no sobrescribir con el valor por defecto.
export async function getStoredCatalog(): Promise<Catalog> {
  const redis = getRedis();
  if (!redis) throw new Error("El almacenamiento no está configurado.");
  const stored = await redis.get<unknown>(CATALOG_KEY);
  if (stored === null) return DEFAULT_CATALOG;
  const result = validateCatalog(stored);
  return result.ok ? result.catalog : DEFAULT_CATALOG;
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
