"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, login, logout } from "@/lib/auth";
import { CONTENT_KEY, validateContent, type SiteContent } from "@/lib/content";
import { getRedis } from "@/lib/redis";

export type LoginState = { error: string | null };

export type SaveResult =
  | { ok: true; content: SiteContent }
  | { ok: false; error: string };

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

  try {
    await redis.set(CONTENT_KEY, result.content);
  } catch {
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
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
