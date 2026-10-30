import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { MAX_LABEL, MAX_LINKS, MAX_TITLE, MAX_URL } from "@/lib/content-limits";
import { DEFAULT_CONTENT } from "@/lib/links";
import { getRedis } from "@/lib/redis";

export type LinkItem = {
  id: string; // uuid generado al crear el botón
  label: string; // texto visible, incluye el emoji
  href: string; // URL http(s)
};

export type SiteContent = {
  brandName: string;
  tagline: string;
  sectionTitle: string;
  logoUrl: string | null; // URL pública en Vercel Blob; null = sin logo
  instagramUrl: string;
  links: LinkItem[]; // el orden del arreglo es el orden en pantalla
};

export const CONTENT_KEY = "overcity:content:v1";


export type ValidationResult =
  | { ok: true; content: SiteContent }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} debe ser texto.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} no puede estar vacío.`);
  if (trimmed.length > max) {
    throw new Error(`${field} no puede superar ${max} caracteres.`);
  }
  return trimmed;
}

function httpUrl(value: unknown, field: string): string {
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

export function validateContent(input: unknown): ValidationResult {
  try {
    if (!isRecord(input)) throw new Error("Contenido inválido.");

    const { links } = input;
    if (!Array.isArray(links)) throw new Error("Los botones deben ser una lista.");
    if (links.length > MAX_LINKS) {
      throw new Error(`No puede haber más de ${MAX_LINKS} botones.`);
    }

    const ids = new Set<string>();
    const validLinks = links.map((item, index): LinkItem => {
      if (!isRecord(item)) throw new Error(`Botón ${index + 1} inválido.`);
      const id = text(item.id, `Id del botón ${index + 1}`, MAX_URL);
      if (ids.has(id)) throw new Error(`Id de botón repetido: ${id}.`);
      ids.add(id);
      return {
        id,
        label: text(item.label, `Texto del botón ${index + 1}`, MAX_LABEL),
        href: httpUrl(item.href, `Link del botón ${index + 1}`),
      };
    });

    const logoUrl =
      input.logoUrl === null || input.logoUrl === undefined
        ? null
        : httpUrl(input.logoUrl, "Logo");

    return {
      ok: true,
      content: {
        brandName: text(input.brandName, "El nombre", MAX_TITLE),
        tagline: text(input.tagline, "El subtítulo", MAX_TITLE),
        sectionTitle: text(input.sectionTitle, "El título de sección", MAX_TITLE),
        logoUrl,
        instagramUrl: httpUrl(input.instagramUrl, "El link de Instagram"),
        links: validLinks,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Contenido inválido.",
    };
  }
}

async function readContent(): Promise<{ content: SiteContent; failed: boolean }> {
  const redis = getRedis();
  if (!redis) return { content: DEFAULT_CONTENT, failed: false };

  try {
    const stored = await redis.get<unknown>(CONTENT_KEY);
    if (stored === null) return { content: DEFAULT_CONTENT, failed: false };
    const result = validateContent(stored);
    return { content: result.ok ? result.content : DEFAULT_CONTENT, failed: false };
  } catch {
    return { content: DEFAULT_CONTENT, failed: true };
  }
}

// Cambia solo el logo del contenido guardado y devuelve la URL anterior.
// A diferencia de getContent(), propaga los errores de Redis para no sobrescribir con valores por defecto.
export async function replaceLogoUrl(logoUrl: string | null): Promise<string | null> {
  const redis = getRedis();
  if (!redis) throw new Error("El almacenamiento no está configurado.");

  const stored = await redis.get<unknown>(CONTENT_KEY);
  const parsed = stored === null ? null : validateContent(stored);
  const current = parsed?.ok ? parsed.content : DEFAULT_CONTENT;

  await redis.set(CONTENT_KEY, { ...current, logoUrl });
  return current.logoUrl;
}

// Sin caché, para el panel. Si falta, es inválido o Redis falla, devuelve DEFAULT_CONTENT.
export async function getContent(): Promise<SiteContent> {
  return (await readContent()).content;
}

// Con caché y etiqueta "content", para la página pública.
export async function getPublicContent(): Promise<SiteContent> {
  "use cache";
  cacheTag("content");

  const { content, failed } = await readContent();
  // Si Redis falló, el respaldo se guarda poco tiempo para reintentar pronto.
  if (failed) cacheLife("minutes");
  else cacheLife("hours");
  return content;
}
