import type { MediaSetting } from "@/lib/content";

// Activos por defecto de la SPEC 04. Viven en public/ y nunca se borran.
export const DEFAULT_BACKGROUND_URL = "/overcity/paisaje-japon-cyberpunk.webp";
export const DEFAULT_MUSIC_URL = "/overcity/musica-fondo.mp3";

// URL que se debe usar para un ajuste, o null si no hay nada que mostrar ("none").
export function resolveMediaUrl(setting: MediaSetting, defaultUrl: string): string | null {
  if (setting.source === "none") return null;
  if (setting.source === "custom" && setting.url) return setting.url;
  return defaultUrl;
}
