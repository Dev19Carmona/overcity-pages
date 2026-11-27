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
export const MAX_PRODUCTS = 500;
export const MAX_CATEGORIES = 50;
export const MAX_DESIGNS = 20; // SPEC 10: una foto por diseño (antes MAX_PRODUCT_IMAGES)
export const MAX_DESIGN_NAME = 40;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_NAME = 60;
export const MAX_PRODUCT_DESCRIPTION = 500;
export const MAX_CATEGORY_NAME = 40;
export const MAX_COLORS = 60; // SPEC 11: colores del catálogo
export const MAX_COLOR_NAME = 24;
export const MAX_DESIGN_COLORS = 10; // colores por diseño
export const MAX_STOCK = 9999; // unidades por talla (SPEC 07)
export const MAX_PRICE = 999_999_999;
export const PRODUCT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Bolsa de compra (SPEC 08): acota también el largo del enlace de WhatsApp.
export const MAX_CART_LINES = 30;

// Pedidos (SPEC 17). `create_order_request` (0002_orders.sql) repite REQUEST_TTL_DAYS y
// MAX_PENDING_REQUESTS; `save_order` repite MAX_ORDER_LINES y `freeze_order`, MAX_FREEZE_HOURS.
export const MAX_ORDER_LINES = 50;
export const MAX_CUSTOMER_NAME = 80;
export const MAX_CUSTOMER_PHONE = 20;
export const MAX_CUSTOMER_ADDRESS = 200;
export const MAX_ORDER_NOTE = 500;
export const MAX_PAYMENT_NOTE = 200;
export const MAX_VOID_REASON = 200;
export const DEFAULT_FREEZE_HOURS = 48;
export const MAX_FREEZE_HOURS = 720;
export const REQUEST_TTL_DAYS = 30;
export const MAX_PENDING_REQUESTS = 1000;
export const REQUEST_RATE_LIMIT = 5; // solicitudes por IP en cada ventana
export const REQUEST_RATE_WINDOW_SECONDS = 10 * 60;
export const REQUEST_TIMEOUT_MS = 3000; // la bolsa no espera más para abrir WhatsApp
export const ORDERS_PAGE_SIZE = 50;
export const PROOF_URL_SECONDS = 60;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = ["image/png", "image/jpeg", "image/webp"];
