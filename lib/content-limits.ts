// Límites de validación compartidos entre el servidor (lib/content.ts) y el editor.
export const MAX_TITLE = 60;
export const MAX_LABEL = 40;
export const MAX_LINKS = 20;
export const MAX_SOCIALS = 8;
export const MAX_URL = 500;

// Fondo y música editables (SPEC 05). Los comparten el servidor, la ruta de subida y el editor.
export const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;
export const MAX_MUSIC_BYTES = 15 * 1024 * 1024;
export const BACKGROUND_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MUSIC_TYPES = ["audio/mpeg"];
