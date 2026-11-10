"use server";

import { del } from "@vercel/blob";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, login, logout } from "@/lib/auth";
import {
  CONTENT_KEY,
  getStoredContent,
  isBlobUrl,
  validateContent,
  type MediaSetting,
  type SiteContent,
} from "@/lib/content";
import { getRedis } from "@/lib/redis";

export type LoginState = { error: string | null };

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
  if (!(await isAdmin())) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };
  }

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

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = formData.get("password");
  if (typeof password !== "string" || !password) {
    return { error: "Escribe la clave." };
  }

  const result = await login(password);
  if (!result.ok) return { error: result.error };

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/admin");
}
