// Pedidos (SPEC 17): tipos, totales y estado derivado. Sin `server-only`: lo usa también el cliente.
import { normalizeText, type CatalogCurrency, type DesignStock } from "@/lib/catalog-shared";

export type OrderStatus = "abierto" | "vendido" | "cancelado" | "anulado";

// "Congelado" y "vencido" no se guardan: son un pedido abierto con `frozenUntil` futuro o pasado.
export type DisplayStatus = OrderStatus | "congelado" | "vencido";

export const STATUS_FILTERS: { value: DisplayStatus | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "abierto", label: "Abiertos" },
  { value: "congelado", label: "Congelados" },
  { value: "vencido", label: "Vencidos" },
  { value: "vendido", label: "Vendidos" },
  { value: "cancelado", label: "Cancelados" },
  { value: "anulado", label: "Anulados" },
];

export const PAYMENT_METHODS = [
  "efectivo",
  "transferencia",
  "nequi_daviplata",
  "tarjeta",
  "contraentrega",
  "otro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  nequi_daviplata: "Nequi / Daviplata",
  tarjeta: "Tarjeta",
  contraentrega: "Contraentrega",
  otro: "Otro",
};

export type RequestStatus = "pendiente" | "convertida" | "descartada";

export const FREEZE_PRESETS: { hours: number; label: string }[] = [
  { hours: 24, label: "24 h" },
  { hours: 48, label: "48 h" },
  { hours: 72, label: "72 h" },
  { hours: 168, label: "7 días" },
];

export const REQUEST_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REQUEST_CODE_PATTERN = /^OC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

// Combinación que identifica una línea.
export type LineCombo = { productId: string; designId: string; color: string; size: string };

export function comboKey(line: LineCombo): string {
  return `${line.productId}|${line.designId}|${line.color}|${line.size}`;
}

// Lo que el navegador envía por línea: nunca nombres ni fotos.
export type OrderLineInput = LineCombo & { qty: number; unitPrice: number | null };

// Línea guardada o en borrador, con las copias para mostrarla.
export type OrderLine = OrderLineInput & {
  productName: string;
  designName: string;
  image: string; // URL pública de la copia de la foto
};

export type OrderCustomer = {
  customerName: string;
  customerPhone: string;
  customerAddress: string; // ciudad y dirección
  note: string;
};

export type OrderAmounts = { discount: number; shipping: number };

export type OrderDraft = OrderCustomer & OrderAmounts & { lines: OrderLine[] };

export type OrderInput = OrderCustomer &
  OrderAmounts & { id: string; requestCode: string | null; lines: OrderLineInput[] };

export type Order = OrderDraft & {
  id: string;
  number: number;
  status: OrderStatus;
  frozenUntil: string | null;
  requestCode: string | null;
  currency: CatalogCurrency;
  paymentMethod: PaymentMethod | null;
  paymentNote: string;
  hasProof: boolean;
  soldAt: string | null;
  soldByName: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  version: number;
  createdAt: string;
};

export type OrderEventType =
  | "creado"
  | "editado"
  | "congelado"
  | "renovado"
  | "liberado"
  | "vendido"
  | "cancelado"
  | "anulado"
  | "comprobante";

export type RestoreLine = {
  productName: string;
  designName: string;
  color: string;
  size: string;
  qty: number;
};

export type OrderEvent = {
  id: number;
  type: OrderEventType;
  actorName: string;
  detail: {
    requestCode?: string;
    lines?: number;
    total?: number;
    hours?: number;
    until?: string;
    method?: PaymentMethod;
    proof?: boolean;
    replaced?: boolean;
    reason?: string;
    notRestored?: RestoreLine[];
  };
  createdAt: string;
};

// Producto del selector de líneas (incluye ocultos).
export type PickerProduct = {
  id: string;
  name: string;
  price: number | null;
  visible: boolean;
  designs: { id: string; name: string; image: string; colors: string[]; stock: DesignStock }[];
};

// Stock físico y disponible (físico − reservado por otros pedidos) por combinación.
export type ComboStock = { physical: number; available: number };
export type StockMap = Record<string, ComboStock>;

export type PickerData = { product: PickerProduct; stock: StockMap };

export type OrderBundle = {
  order: Order;
  events: OrderEvent[];
  products: Record<string, PickerProduct>; // solo los de las líneas que aún existen
  stock: StockMap;
};

export type Shortage = {
  productName: string;
  designName: string;
  color: string;
  size: string;
  requested: number;
  available: number;
};

export type OrderSummary = {
  id: string;
  number: number;
  status: OrderStatus;
  frozenUntil: string | null;
  requestCode: string | null;
  customerName: string;
  currency: CatalogCurrency;
  total: number;
  createdAt: string;
};

export type RequestLine = LineCombo & {
  qty: number;
  productName: string;
  designName: string;
  unitPrice: number | null;
};

export type OrderRequest = {
  code: string;
  lines: RequestLine[];
  currency: CatalogCurrency;
  status: RequestStatus;
  orderId: string | null;
  createdAt: string;
};

// ---- Totales ----

type Priced = { unitPrice: number | null; qty: number };

// Suma de las líneas con precio.
export function orderSubtotal(lines: readonly Priced[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.unitPrice === null ? 0 : line.unitPrice * line.qty),
    0,
  );
}

export function orderTotal(lines: readonly Priced[], amounts: OrderAmounts): number {
  return orderSubtotal(lines) - amounts.discount + amounts.shipping;
}

// Junta las líneas de la misma combinación sumando cantidades; manda el precio de la primera.
export function mergeLines<T extends LineCombo & { qty: number }>(
  lines: readonly T[],
  maxQty = 9999,
): T[] {
  const merged = new Map<string, T>();
  for (const line of lines) {
    const key = comboKey(line);
    const previous = merged.get(key);
    merged.set(key, previous ? { ...previous, qty: Math.min(previous.qty + line.qty, maxQty) } : line);
  }
  return [...merged.values()];
}

// ---- Estado derivado y formatos ----

export function displayStatus(
  order: { status: OrderStatus; frozenUntil: string | null },
  now: number,
): DisplayStatus {
  if (order.status !== "abierto" || order.frozenUntil === null) return order.status;
  return Date.parse(order.frozenUntil) > now ? "congelado" : "vencido";
}

function remainingLabel(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(ms / 3_600_000);
  if (hours <= 48) return `${hours} h`;
  return `${Math.ceil(ms / 86_400_000)} días`;
}

export function statusLabel(
  order: { status: OrderStatus; frozenUntil: string | null },
  now: number,
): string {
  switch (displayStatus(order, now)) {
    case "congelado":
      return `Congelado · vence en ${remainingLabel(Date.parse(order.frozenUntil as string) - now)}`;
    case "vencido":
      return "Congelamiento vencido";
    case "abierto":
      return "Abierto";
    case "vendido":
      return "Vendido";
    case "cancelado":
      return "Cancelado";
    case "anulado":
      return "Anulado";
  }
}

export function formatOrderNumber(value: number): string {
  return `#${String(value).padStart(4, "0")}`;
}

// Fecha y hora en Bogotá como "26/11/2026 14:05". Se arma por partes para que el servidor y el
// navegador produzcan el mismo texto.
const DATE_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(iso: string): string {
  const parts = Object.fromEntries(
    DATE_PARTS.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function reservedStockMessage(numbers: readonly number[]): string {
  const list = numbers.map(formatOrderNumber);
  if (list.length === 0) return "No se puede guardar: hay unidades reservadas. Intenta de nuevo.";
  if (list.length === 1) {
    return `No se puede guardar: hay unidades reservadas en el pedido ${list[0]}. Libéralo o ajústalo primero.`;
  }
  const head = list.slice(0, -1).join(", ");
  return `No se puede guardar: hay unidades reservadas en los pedidos ${head} y ${list[list.length - 1]}. Libéralos o ajústalos primero.`;
}

export function normalizeSearch(value: string): string {
  return normalizeText(value).trim().slice(0, 80);
}
