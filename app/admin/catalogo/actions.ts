"use server";

import { updateTag } from "next/cache";
import { isAdmin } from "@/lib/auth";
import {
  getAdminCatalogList,
  getAdminColors,
  removeProduct,
  writeCategories,
  writeColors,
  writeProduct,
  writeProductMove,
  writeProductVisible,
  writeSettings,
  type CatalogSettingsInput,
  type WriteResult,
} from "@/lib/catalog";
import {
  normalizeWhatsapp,
  type CatalogCategory,
  type CatalogColorDef,
  type CatalogCurrency,
  type CatalogList,
  type CatalogProduct,
  type ColorUsageMap,
} from "@/lib/catalog-shared";

type Fail = { ok: false; error: string };

// Lista ligera del panel después de un cambio (SPEC 12: ya no se devuelve el catálogo completo).
export type ListResult = { ok: true; list: CatalogList } | Fail;
export type ProductResult = { ok: true; version: number; product: CatalogProduct } | Fail;
export type ColorsResult = { ok: true; colors: CatalogColorDef[]; usage: ColorUsageMap } | Fail;
export type SettingsResult = { ok: true; settings: CatalogSettingsInput } | Fail;

// Cada acción exige sesión, valida y escribe mediante una RPC transaccional; si sale bien, las fotos
// que ya nadie usa se borran de Storage (dentro de `lib/catalog`) y se invalida la caché del catálogo.
async function withSession<T>(fn: () => Promise<T | Fail>): Promise<T | Fail> {
  if (!(await isAdmin())) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
  }
  try {
    return await fn();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : "No se pudo guardar. Intenta de nuevo.",
    };
  }
}

function fail(result: WriteResult): Fail {
  return { ok: false, error: result.ok ? "No se pudo guardar. Intenta de nuevo." : result.error };
}

async function listAfter(write: WriteResult): Promise<ListResult> {
  if (!write.ok) return fail(write);
  updateTag("catalog");
  return { ok: true, list: await getAdminCatalogList() };
}

export async function saveCatalogSettings(input: {
  title: string;
  currency: CatalogCurrency;
  whatsapp: string;
  freeShippingFrom: number | null;
}): Promise<SettingsResult> {
  const whatsapp = typeof input.whatsapp === "string" ? normalizeWhatsapp(input.whatsapp) : null;
  if (whatsapp === null) {
    return {
      ok: false,
      error: "El número de WhatsApp debe tener entre 8 y 15 dígitos, con código de país.",
    };
  }
  return withSession(async () => {
    const settings = { ...input, whatsapp };
    const write = await writeSettings(settings);
    if (!write.ok) return fail(write);
    updateTag("catalog");
    return { ok: true as const, settings: { ...settings, title: settings.title.trim() } };
  });
}

// Reemplaza la lista de categorías (crear, renombrar, reordenar, talla única, quitar).
// Los productos de una categoría quitada quedan sin categoría; si cambian sus tallas, el stock
// se ajusta en la misma transacción (talla única = suma de las tallas de ese color; de única a
// varias tallas empieza en 0).
export async function saveCategories(categories: CatalogCategory[]): Promise<ListResult> {
  return withSession(async () => listAfter(await writeCategories(categories)));
}

// Reemplaza la lista de colores (crear, hex, orden, ocultar, quitar). El nombre es el identificador:
// no se puede quitar un color que algún diseño usa (la base lo impide y el mensaje trae el conteo).
export async function saveColors(colors: CatalogColorDef[]): Promise<ColorsResult> {
  return withSession(async () => {
    const write = await writeColors(colors);
    if (!write.ok) return fail(write);
    updateTag("catalog");
    return { ok: true as const, ...(await getAdminColors()) };
  });
}

// Crea (expectedVersion null) o actualiza un producto. Si cambió desde que se abrió la ficha,
// se rechaza con el mensaje de conflicto y no se escribe nada.
export async function saveProduct(
  product: unknown,
  expectedVersion: number | null,
): Promise<ProductResult> {
  if (expectedVersion !== null && !Number.isInteger(expectedVersion)) {
    return { ok: false, error: "Versión del producto inválida." };
  }
  return withSession(async () => {
    const write = await writeProduct(product, expectedVersion);
    if (!write.ok) return fail(write);
    if (!write.product || write.version === undefined) return fail(write);
    updateTag("catalog");
    return { ok: true as const, version: write.version, product: write.product };
  });
}

export async function deleteProduct(id: string): Promise<ListResult> {
  return withSession(async () => listAfter(await removeProduct(id)));
}

export async function setProductVisible(id: string, visible: boolean): Promise<ListResult> {
  return withSession(async () => listAfter(await writeProductVisible(id, visible)));
}

export async function moveProduct(id: string, offset: -1 | 1): Promise<ListResult> {
  return withSession(async () => listAfter(await writeProductMove(id, offset)));
}
