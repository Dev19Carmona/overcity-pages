import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const CATALOG_BUCKET = "catalog";

let client: SupabaseClient | null | undefined;

// Cliente con service role: solo servidor. Sin las variables devuelve null.
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client =
    url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return client;
}

// Igual que getSupabase pero lanza si falta la configuración (para lecturas y escrituras del catálogo).
export function requireSupabase(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error("El almacenamiento del catálogo no está configurado.");
  return supabase;
}

// URL pública base de las fotos del catálogo; las filas guardan solo la ruta (image_path).
export function catalogPublicBase(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL no está configurada.");
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${CATALOG_BUCKET}/`;
}

export function catalogImageUrl(imagePath: string): string {
  return `${catalogPublicBase()}${imagePath}`;
}
