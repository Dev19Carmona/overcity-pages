import "server-only";
import type { Redis } from "@upstash/redis";
import { cacheLife, cacheTag } from "next/cache";
import {
  MAX_LABEL,
  MAX_LINKS,
  MAX_SOCIALS,
  MAX_TITLE,
  MAX_URL,
} from "@/lib/content-limits";
import { DEFAULT_CONTENT } from "@/lib/links";
import { getRedis } from "@/lib/redis";
import { isSocialNetwork, SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/socials";

export type LinkItem = {
  id: string; // uuid generado al crear el botón
  label: string; // texto visible, incluye el emoji
  href: string; // URL http(s)
};

export type SocialItem = {
  id: string; // uuid generado al agregar la red
  network: SocialNetwork;
  url: string; // http(s) para todas; mailto: solo para "email"
};

export type SiteContent = {
  brandName: string;
  tagline: string;
  sectionTitle: string;
  logoUrl: string | null; // URL pública en Vercel Blob; null = sin logo
  socialsTitle: string;
  socials: SocialItem[]; // el orden del arreglo es el orden en pantalla
  links: LinkItem[]; // el orden del arreglo es el orden en pantalla
};

export const CONTENT_KEY = "overcity:content:v2";
// Contenido de la SPEC 02 (con instagramUrl). Solo se lee, nunca se modifica.
const LEGACY_CONTENT_KEY = "overcity:content:v1";

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

function socialUrl(network: SocialNetwork, value: unknown, field: string): string {
  if (!SOCIAL_NETWORKS[network].mailto) return httpUrl(value, field);

  const url = text(value, field, MAX_URL);
  if (!/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) {
    throw new Error(`${field} debe ser del tipo mailto:correo@dominio.com.`);
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

    const { socials } = input;
    if (!Array.isArray(socials)) throw new Error("Las redes deben ser una lista.");
    if (socials.length > MAX_SOCIALS) {
      throw new Error(`No puede haber más de ${MAX_SOCIALS} redes.`);
    }

    const socialIds = new Set<string>();
    const validSocials = socials.map((item, index): SocialItem => {
      if (!isRecord(item)) throw new Error(`Red ${index + 1} inválida.`);
      if (!isSocialNetwork(item.network)) {
        throw new Error(`La red ${index + 1} no está en el catálogo.`);
      }
      const id = text(item.id, `Id de la red ${index + 1}`, MAX_URL);
      if (socialIds.has(id)) throw new Error(`Id de red repetido: ${id}.`);
      socialIds.add(id);
      return {
        id,
        network: item.network,
        url: socialUrl(
          item.network,
          item.url,
          `El link de ${SOCIAL_NETWORKS[item.network].label} (red ${index + 1})`,
        ),
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
        socialsTitle: text(input.socialsTitle, "El título de redes", MAX_TITLE),
        socials: validSocials,
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

// Convierte el contenido de la SPEC 02 (v1): instagramUrl pasa a ser la primera red.
function migrateLegacy(legacy: unknown): unknown {
  if (!isRecord(legacy)) return legacy;
  const { instagramUrl, ...rest } = legacy;
  return {
    ...rest,
    socialsTitle: DEFAULT_CONTENT.socialsTitle,
    socials: [{ id: "instagram", network: "instagram", url: instagramUrl }],
  };
}

// Lee v2; si no existe, lee v1 y lo convierte en memoria. Propaga los errores de Redis.
async function loadStored(redis: Redis): Promise<SiteContent> {
  let stored = await redis.get<unknown>(CONTENT_KEY);
  if (stored === null) {
    const legacy = await redis.get<unknown>(LEGACY_CONTENT_KEY);
    stored = legacy === null ? null : migrateLegacy(legacy);
  }
  if (stored === null) return DEFAULT_CONTENT;

  const result = validateContent(stored);
  return result.ok ? result.content : DEFAULT_CONTENT;
}

async function readContent(): Promise<{ content: SiteContent; failed: boolean }> {
  const redis = getRedis();
  if (!redis) return { content: DEFAULT_CONTENT, failed: false };

  try {
    return { content: await loadStored(redis), failed: false };
  } catch {
    return { content: DEFAULT_CONTENT, failed: true };
  }
}

// Cambia solo el logo del contenido guardado y devuelve la URL anterior.
// A diferencia de getContent(), propaga los errores de Redis para no sobrescribir con valores por defecto.
export async function replaceLogoUrl(logoUrl: string | null): Promise<string | null> {
  const redis = getRedis();
  if (!redis) throw new Error("El almacenamiento no está configurado.");

  const current = await loadStored(redis);
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
