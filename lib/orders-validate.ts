// Validación de pedidos y solicitudes (SPEC 17). Sin `server-only`: se prueba sola.
// La base repite las reglas que dependen de datos guardados (existencia, disponible, estado).
import {
  MAX_CART_LINES,
  MAX_CUSTOMER_ADDRESS,
  MAX_CUSTOMER_NAME,
  MAX_CUSTOMER_PHONE,
  MAX_FREEZE_HOURS,
  MAX_ORDER_LINES,
  MAX_ORDER_NOTE,
  MAX_PAYMENT_NOTE,
  MAX_PRICE,
  MAX_PROOF_BYTES,
  MAX_STOCK,
  MAX_URL,
  MAX_VOID_REASON,
  PROOF_TYPES,
} from "@/lib/content-limits";
import {
  PAYMENT_METHODS,
  REQUEST_CODE_PATTERN,
  mergeLines,
  orderSubtotal,
  type LineCombo,
  type OrderInput,
  type OrderLineInput,
  type PaymentMethod,
} from "@/lib/orders-shared";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// Tope de la columna `discount` (int de Postgres).
const MAX_DISCOUNT = 2_147_483_647;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isRequestCode(value: unknown): value is string {
  return typeof value === "string" && REQUEST_CODE_PATTERN.test(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_URL;
}

function readCombo(line: Record<string, unknown>): LineCombo | null {
  const { productId, designId, color, size } = line;
  if (!isId(productId) || !isId(designId) || !isId(color) || !isId(size)) return null;
  return { productId, designId, color, size };
}

function text(value: unknown, max: number, label: string): Checked<string> {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return fail(`${label}: dato inválido.`);
  const clean = value.trim();
  if (clean.length > max) return fail(`${label}: máximo ${max} caracteres.`);
  return { ok: true, value: clean };
}

// Pedido enviado por el panel. Agrega las líneas repetidas y descarta cualquier campo de más
// (nombres y fotos nunca se aceptan del navegador).
export function validateOrder(input: unknown): Checked<OrderInput> {
  const data = record(input);
  if (!data || !isOrderId(data.id)) return fail("Pedido inválido.");

  let requestCode: string | null = null;
  if (data.requestCode !== null && data.requestCode !== undefined) {
    if (!isRequestCode(data.requestCode)) return fail("Código de solicitud inválido.");
    requestCode = data.requestCode;
  }

  const name = text(data.customerName, MAX_CUSTOMER_NAME, "Nombre del cliente");
  if (!name.ok) return name;
  const phone = text(data.customerPhone, MAX_CUSTOMER_PHONE, "Teléfono");
  if (!phone.ok) return phone;
  const address = text(data.customerAddress, MAX_CUSTOMER_ADDRESS, "Ciudad y dirección");
  if (!address.ok) return address;
  const note = text(data.note, MAX_ORDER_NOTE, "Nota");
  if (!note.ok) return note;

  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    return fail("Agrega al menos una línea al pedido.");
  }
  if (data.lines.length > MAX_ORDER_LINES * 2) {
    return fail(`Un pedido admite hasta ${MAX_ORDER_LINES} líneas.`);
  }
  const lines: OrderLineInput[] = [];
  for (const raw of data.lines) {
    const item = record(raw);
    const combo = item && readCombo(item);
    if (!item || !combo) return fail("Hay una línea inválida.");
    if (!isInt(item.qty, 1, MAX_STOCK)) {
      return fail(`Las cantidades deben estar entre 1 y ${MAX_STOCK}.`);
    }
    if (item.unitPrice !== null && !isInt(item.unitPrice, 0, MAX_PRICE)) {
      return fail("Hay un precio inválido.");
    }
    lines.push({ ...combo, qty: item.qty, unitPrice: item.unitPrice as number | null });
  }
  const merged = mergeLines(lines, MAX_STOCK);
  if (merged.length > MAX_ORDER_LINES) {
    return fail(`Un pedido admite hasta ${MAX_ORDER_LINES} líneas.`);
  }

  if (!isInt(data.discount, 0, MAX_DISCOUNT)) return fail("El descuento no es válido.");
  if (!isInt(data.shipping, 0, MAX_PRICE)) return fail("El envío no es válido.");
  if (data.discount > orderSubtotal(merged)) {
    return fail("El descuento no puede ser mayor que el subtotal.");
  }

  return {
    ok: true,
    value: {
      id: data.id,
      requestCode,
      customerName: name.value,
      customerPhone: phone.value,
      customerAddress: address.value,
      note: note.value,
      discount: data.discount,
      shipping: data.shipping,
      lines: merged,
    },
  };
}

export function validateHours(value: unknown): Checked<number> {
  return isInt(value, 1, MAX_FREEZE_HOURS)
    ? { ok: true, value }
    : fail(`El plazo debe ser un número entero entre 1 y ${MAX_FREEZE_HOURS} horas.`);
}

export type PaymentInput = { method: PaymentMethod; note: string; proofPath: string | null };

export function validatePayment(input: unknown): Checked<PaymentInput> {
  const data = record(input);
  const method = PAYMENT_METHODS.find((item) => item === data?.method);
  if (!data || !method) return fail("Elige un método de pago.");
  const note = text(data.note, MAX_PAYMENT_NOTE, "Nota del pago");
  if (!note.ok) return note;
  const proofPath = typeof data.proofPath === "string" && data.proofPath ? data.proofPath : null;
  if (proofPath && method === "efectivo") return fail("El pago en efectivo no lleva comprobante.");
  return { ok: true, value: { method, note: note.value, proofPath } };
}

export function validateVoidReason(value: unknown): Checked<string> {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) return fail("Escribe el motivo de la anulación.");
  if (clean.length > MAX_VOID_REASON) return fail(`El motivo admite hasta ${MAX_VOID_REASON} caracteres.`);
  return { ok: true, value: clean };
}

const PROOF_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function validateProofUpload(input: unknown): Checked<{ orderId: string; extension: string }> {
  const data = record(input);
  if (!data || !isOrderId(data.orderId)) return fail("Pedido inválido.");
  const contentType = typeof data.contentType === "string" ? data.contentType : "";
  if (!PROOF_TYPES.includes(contentType)) return fail("Solo PNG, JPG o WebP.");
  if (!isInt(data.size, 1, MAX_PROOF_BYTES)) {
    return fail(`La imagen no puede superar ${MAX_PROOF_BYTES / 1048576} MB.`);
  }
  return { ok: true, value: { orderId: data.orderId, extension: PROOF_EXTENSIONS[contentType] } };
}

// Nombre del archivo si la ruta es un comprobante generado por el servidor para ese pedido.
export function proofFileName(orderId: string, path: unknown): string | null {
  const prefix = `proofs/${orderId}/`;
  if (typeof path !== "string" || !isOrderId(orderId) || !path.startsWith(prefix)) return null;
  const file = path.slice(prefix.length);
  return /^[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(file) ? file : null;
}

// Líneas que la tienda envía al crear una solicitud: solo combinación y cantidad.
export function validateRequestLines(input: unknown): Checked<(LineCombo & { qty: number })[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_CART_LINES) {
    return fail("Bolsa inválida.");
  }
  const lines: (LineCombo & { qty: number })[] = [];
  for (const raw of input) {
    const item = record(raw);
    const combo = item && readCombo(item);
    if (!item || !combo || !isInt(item.qty, 1, MAX_STOCK)) return fail("Bolsa inválida.");
    lines.push({ ...combo, qty: item.qty });
  }
  return { ok: true, value: mergeLines(lines, MAX_STOCK) };
}
