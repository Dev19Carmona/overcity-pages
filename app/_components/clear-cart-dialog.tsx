"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/app/_components/cart-provider";
import { onlyHasSentItems, SENT_PROMPT_DELAY_MS } from "@/lib/cart-sent";

const button =
  "flex h-12 items-center justify-center rounded-full border px-5 text-[15px] font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

// Unos segundos después de enviar el pedido por WhatsApp pregunta si se vacía la bolsa.
// Nunca la vacía sin que el cliente lo confirme.
export default function ClearCartDialog() {
  const { lines, hydrated, sentOrder, dismissSentOrder, clear } = useCart();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const sentAt = sentOrder?.at ?? null;
  const askable = hydrated && sentOrder !== null && onlyHasSentItems(lines, sentOrder);
  const visible = askable && readyAt === sentAt;

  // La bolsa cambió (o se vació) después del envío: ya no hay nada que preguntar.
  useEffect(() => {
    if (hydrated && sentOrder && !askable) dismissSentOrder();
  }, [hydrated, sentOrder, askable, dismissSentOrder]);

  useEffect(() => {
    if (!askable || sentAt === null) return;
    const timer = setTimeout(() => setReadyAt(sentAt), SENT_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [askable, sentAt]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible && !dialog.open) dialog.showModal();
    if (!visible && dialog.open) dialog.close();
  }, [visible]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="clear-cart-title"
      aria-describedby="clear-cart-text"
      // Escape equivale a conservar la bolsa.
      onCancel={dismissSentOrder}
      className="m-auto w-[min(400px,calc(100%-32px))] rounded-2xl border border-theme-red/50 bg-theme-navy p-6 text-white shadow-[0_0_30px_rgba(216,26,33,0.2)]"
    >
      <h2 id="clear-cart-title" className="premium-heading text-lg font-extrabold">
        ¿Vaciamos tu bolsa?
      </h2>
      <p id="clear-cart-text" className="mt-2 text-sm text-white/80">
        Si ya enviaste tu pedido por WhatsApp, puedes vaciarla. Si todavía no lo enviaste,
        consérvala.
      </p>
      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={clear}
          className={`${button} border-theme-red bg-theme-red hover:shadow-[0_0_20px_rgba(216,26,33,0.5)]`}
        >
          Sí, vaciar bolsa
        </button>
        <button
          type="button"
          autoFocus
          onClick={dismissSentOrder}
          className={`${button} border-border-soft bg-black/30 hover:border-theme-red hover:bg-theme-red/20`}
        >
          No, conservarla
        </button>
      </div>
    </dialog>
  );
}
