"use server";

import { del } from "@vercel/blob";
import { updateTag } from "next/cache";
import { isAdmin } from "@/lib/auth";
import {
  CATALOG_KEY,
  catalogImageUrls,
  getStoredCatalog,
  validateCatalog,
  type Catalog,
} from "@/lib/catalog";
import {
  emptyStock,
  ONE_SIZE,
  sizesFor,
  stockTotal,
  type CatalogCategory,
  type CatalogCurrency,
} from "@/lib/catalog-shared";
import { isBlobUrl } from "@/lib/content";
import { getRedis } from "@/lib/redis";

export type CatalogActionResult =
  | { ok: true; catalog: Catalog }
  | { ok: false; error: string };

type Mutation = (current: Catalog) => unknown | string;

// Lee el catálogo guardado, aplica el cambio, valida y escribe en Redis. Después borra de Blob
// las imágenes que quedaron sin uso (primero Redis, para no dejar enlaces rotos).
// `mutate` devuelve el catálogo nuevo o un texto con el motivo del rechazo.
async function apply(mutate: Mutation): Promise<CatalogActionResult> {
  if (!(await isAdmin())) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
  }

  const redis = getRedis();
  if (!redis) {
    return { ok: false, error: "El almacenamiento no está configurado." };
  }

  let previous: Catalog;
  try {
    previous = await getStoredCatalog();
  } catch {
    return { ok: false, error: "No se pudo leer el catálogo. Intenta de nuevo." };
  }

  const next = mutate(previous);
  if (typeof next === "string") return { ok: false, error: next };

  const result = validateCatalog(next);
  if (!result.ok) return result;

  try {
    await redis.set(CATALOG_KEY, result.catalog);
  } catch {
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }

  const stillUsed = catalogImageUrls(result.catalog);
  const stale = [...catalogImageUrls(previous)].filter(
    (url) => !stillUsed.has(url) && isBlobUrl(url),
  );
  if (stale.length > 0) {
    try {
      await del(stale);
    } catch {
      // Un archivo huérfano no debe romper el guardado.
    }
  }

  updateTag("catalog");
  return { ok: true, catalog: result.catalog };
}

export async function saveCatalogSettings(input: {
  title: string;
  currency: CatalogCurrency;
}): Promise<CatalogActionResult> {
  return apply((current) => ({ ...current, title: input.title, currency: input.currency }));
}

// Reemplaza la lista de categorías (crear, renombrar, reordenar, talla única, quitar).
// Los productos de una categoría quitada quedan sin categoría; si cambian sus tallas, el stock
// se ajusta (talla única = suma de todo; de única a varias tallas empieza en 0).
export async function saveCategories(
  categories: CatalogCategory[],
): Promise<CatalogActionResult> {
  return apply((current) => {
    if (!Array.isArray(categories)) return "Las categorías deben ser una lista.";
    const byId = new Map(categories.map((category) => [category.id, category]));
    const products = current.products.map((product) => {
      const categoryId =
        product.categoryId !== null && byId.has(product.categoryId) ? product.categoryId : null;
      const sizes = sizesFor(categoryId === null ? null : byId.get(categoryId));
      const sameSizes =
        Object.keys(product.stock).length === sizes.length &&
        sizes.every((size) => size in product.stock);
      const stock = sameSizes
        ? product.stock
        : sizes.length === 1 && sizes[0] === ONE_SIZE
          ? { [ONE_SIZE]: stockTotal(product) }
          : emptyStock(sizes);
      return { ...product, categoryId, stock };
    });
    return { ...current, categories, products };
  });
}

// Crea o actualiza un producto (por id). Un producto nuevo va al final de la lista.
export async function saveProduct(product: unknown): Promise<CatalogActionResult> {
  return apply((current) => {
    const id =
      typeof product === "object" && product !== null && "id" in product
        ? (product as { id: unknown }).id
        : null;
    if (typeof id !== "string" || !id) return "El producto no tiene id.";
    const exists = current.products.some((item) => item.id === id);
    const products = exists
      ? current.products.map((item) => (item.id === id ? product : item))
      : [...current.products, product];
    return { ...current, products };
  });
}

export async function deleteProduct(id: string): Promise<CatalogActionResult> {
  return apply((current) => {
    if (!current.products.some((product) => product.id === id)) return "El producto no existe.";
    return { ...current, products: current.products.filter((product) => product.id !== id) };
  });
}

export async function setProductVisible(
  id: string,
  visible: boolean,
): Promise<CatalogActionResult> {
  return apply((current) => {
    if (!current.products.some((product) => product.id === id)) return "El producto no existe.";
    return {
      ...current,
      products: current.products.map((product) =>
        product.id === id ? { ...product, visible } : product,
      ),
    };
  });
}

export async function moveProduct(id: string, offset: -1 | 1): Promise<CatalogActionResult> {
  return apply((current) => {
    const index = current.products.findIndex((product) => product.id === id);
    if (index < 0) return "El producto no existe.";
    const target = index + offset;
    if (target < 0 || target >= current.products.length) return current;
    const products = [...current.products];
    [products[index], products[target]] = [products[target], products[index]];
    return { ...current, products };
  });
}
