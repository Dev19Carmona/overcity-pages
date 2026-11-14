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

// Catálogo de productos (SPEC 06). Los comparten el servidor, la ruta de subida y el editor.
export const MAX_PRODUCTS = 40;
export const MAX_CATEGORIES = 10;
export const MAX_PRODUCT_IMAGES = 4;
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PRODUCT_NAME = 60;
export const MAX_PRODUCT_DESCRIPTION = 500;
export const MAX_CATEGORY_NAME = 40;
export const MAX_PRICE = 999_999_999;
export const PRODUCT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
