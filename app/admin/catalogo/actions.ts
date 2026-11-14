"use server";

import { del } from "@vercel/blob";
import { updateTag } from "next/cache";
import { isAdmin } from "@/lib/auth";
import {
  CATALOG_KEY,
  getStoredCatalog,
  validateCatalog,
  type Catalog,
} from "@/lib/catalog";
import { isBlobUrl } from "@/lib/content";
import { getRedis } from "@/lib/redis";

export type SaveCatalogResult =
  | { ok: true; catalog: Catalog }
  | { ok: false; error: string };

function usedImages(catalog: Catalog): Set<string> {
  return new Set(catalog.products.flatMap((product) => product.images));
}

export async function saveCatalog(input: unknown): Promise<SaveCatalogResult> {
  if (!(await isAdmin())) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
  }

  const result = validateCatalog(input);
  if (!result.ok) return result;

  const redis = getRedis();
  if (!redis) {
    return { ok: false, error: "El almacenamiento no está configurado." };
  }

  // Si no se puede leer lo guardado, se guarda igual y las imágenes retiradas quedan huérfanas.
  const previous = await getStoredCatalog().catch(() => null);

  // Primero se escribe el catálogo; después se borran los archivos sobrantes.
  try {
    await redis.set(CATALOG_KEY, result.catalog);
  } catch {
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }

  if (previous) {
    const stillUsed = usedImages(result.catalog);
    const stale = [...usedImages(previous)].filter(
      (url) => !stillUsed.has(url) && isBlobUrl(url),
    );
    if (stale.length > 0) {
      try {
        await del(stale);
      } catch {
        // Un archivo huérfano no debe romper el guardado.
      }
    }
  }

  updateTag("catalog");
  return { ok: true, catalog: result.catalog };
}
