// Pedido ya enviado por WhatsApp: se recuerda para preguntar si se vacía la bolsa, aunque el
// navegador recargue la página mientras el cliente está en WhatsApp. Apto para el cliente.
import { lineKey, type CartLine } from "@/lib/cart";
import { REQUEST_STORAGE_KEY } from "@/lib/order-request-client";

export const SENT_KEY = "overcity:cart-sent:v1";
export const SENT_PROMPT_DELAY_MS = 4000;
export const SENT_TTL_MS = 24 * 60 * 60 * 1000;

export type SentOrder = { lines: CartLine[]; at: number };

export function writeSentOrder(sent: SentOrder): void {
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify(sent));
  } catch {
    // Sin almacenamiento la pregunta solo sale si la página sigue abierta.
  }
}

export function readSentOrder(now = Date.now()): SentOrder | null {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(SENT_KEY) ?? "null",
    ) as Partial<SentOrder> | null;
    if (!saved || !Array.isArray(saved.lines) || typeof saved.at !== "number") return null;
    return now - saved.at < SENT_TTL_MS ? { lines: saved.lines, at: saved.at } : null;
  } catch {
    return null;
  }
}

export function forgetSentOrder(): void {
  try {
    window.localStorage.removeItem(SENT_KEY);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

// Al vaciar la bolsa, un pedido igual más adelante es uno nuevo y necesita su propio código.
export function forgetRequestCode(): void {
  try {
    window.sessionStorage.removeItem(REQUEST_STORAGE_KEY);
  } catch {
    // Sin almacenamiento no hay código guardado.
  }
}

// Solo se pregunta si todo lo que hay en la bolsa ya iba en el pedido enviado. Si el cliente agregó
// algo después, es un pedido que todavía no ha mandado.
export function onlyHasSentItems(lines: readonly CartLine[], sent: SentOrder): boolean {
  const sentQty = new Map(sent.lines.map((line) => [lineKey(line), line.qty]));
  return lines.length > 0 && lines.every((line) => line.qty <= (sentQty.get(lineKey(line)) ?? 0));
}
