"use server";

import { del } from "@vercel/blob";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { logout, requirePermission } from "@/lib/auth";
import {
  CONTENT_KEY,
  getStoredContent,
  isBlobUrl,
  validateContent,
  type MediaSetting,
  type SiteContent,
} from "@/lib/content";
import { getRedis } from "@/lib/redis";

export type SaveResult =
  | { ok: true; content: SiteContent }
  | { ok: false; error: string };

// URL de Blob que dejó de usarse al pasar de `before` a `after`; null si no hay nada que borrar.
// Los activos por defecto (public/) nunca cuentan: solo hay URL con source "custom".
function replacedBlobUrl(before: MediaSetting, after: MediaSetting): string | null {
  if (before.source !== "custom" || !before.url) return null;
  if (after.source === "custom" && after.url === before.url) return null;
  return isBlobUrl(before.url) ? before.url : null;
}

async function deleteBlobs(urls: (string | null)[]) {
  const stale = urls.filter((url): url is string => url !== null);
  if (stale.length === 0) return;
  try {
    await del(stale);
  } catch {
    // Un archivo huérfano no debe romper el guardado.
  }
}

export async function saveContent(input: unknown): Promise<SaveResult> {
  const auth = await requirePermission("links.contenido.editar");
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = validateContent(input);
  if (!result.ok) return result;

  const redis = getRedis();
  if (!redis) {
    return { ok: false, error: "El almacenamiento no está configurado." };
  }

  // Si no se puede leer lo guardado, se guarda igual y el archivo anterior queda huérfano.
  const previous = await getStoredContent().catch(() => null);

  try {
    await redis.set(CONTENT_KEY, result.content);
  } catch {
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }

  // El archivo anterior se borra al guardar, nunca al subir.
  if (previous) {
    await deleteBlobs([
      replacedBlobUrl(previous.background, result.content.background),
      replacedBlobUrl(previous.music, result.content.music),
    ]);
  }

  updateTag("content");
  return { ok: true, content: result.content };
}

// SPEC 15: si hay `id_token` guardado, el navegador pasa por el IdP para cerrar también la sesión
// de base-template; si no, solo se cierra la de Overcity y se vuelve al acceso del panel.
export async function logoutAction(): Promise<void> {
  const endSessionUrl = await logout();
  redirect(endSessionUrl ?? "/admin");
}
