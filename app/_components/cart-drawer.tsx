"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCart, type CartToastState } from "@/app/_components/cart-provider";
import {
  buildOrderMessage,
  cartCount,
  cartSubtotal,
  lineImage,
  lineKey,
  lineTotal,
  whatsappUrl,
} from "@/lib/cart";
import { CATALOG_COLOR_HEX, formatPrice } from "@/lib/catalog-shared";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

// Aviso temporal de la bolsa. `inline` lo pone dentro del cajón (la capa superior del <dialog>
// tapa cualquier cosa fuera de él); si no, flota abajo al centro.
export function CartToast({
  toast,
  onClose,
  inline = false,
}: {
  toast: CartToastState;
  onClose: () => void;
  inline?: boolean;
}) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className={
        inline
          ? "mx-4 mb-2 flex shrink-0 items-center justify-between gap-4 rounded-full border border-theme-red/55 bg-black/40 px-4 py-2.5"
          : "fixed bottom-5 left-1/2 z-[80] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-4 rounded-full border border-theme-red/55 bg-theme-navy/95 px-5 py-3 shadow-[0_0_20px_rgba(255,35,62,0.3)]"
      }
    >
      <span className="text-sm">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onClose();
          }}
          className={`whitespace-nowrap text-sm font-extrabold text-[#ff5a63] ${focusRing}`}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

const stepButton = `size-8 text-base text-white disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export default function CartDrawer() {
  const { catalog, lines, open, closeCart, setQty, remove, toast, dismissToast } = useCart();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { products, currency, whatsapp, freeShippingFrom } = catalog;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  const count = cartCount(lines);
  const subtotal = cartSubtotal(lines, products);
  const unpriced = lines.some((line) => lineTotal(line, products) === null);
  const empty = lines.length === 0;
  const canSend = !empty && whatsapp !== "";
  const missing = freeShippingFrom === null ? 0 : Math.max(0, freeShippingFrom - subtotal);
  const percent =
    freeShippingFrom === null ? 0 : Math.min(100, (subtotal / freeShippingFrom) * 100);

  function send() {
    const text = buildOrderMessage(lines, catalog, window.location.origin);
    window.open(whatsappUrl(whatsapp, text), "_blank", "noopener,noreferrer");
  }

  return (
    <>
    <dialog
      ref={dialogRef}
      aria-labelledby="cart-title"
      onClose={closeCart}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeCart();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-white backdrop:bg-[rgba(10,28,41,0.7)] backdrop:backdrop-blur-[4px]"
    >
      <div className="cart-drawer-panel absolute inset-y-0 right-0 flex w-[min(440px,100%)] flex-col border-l border-[rgba(255,48,72,0.4)] bg-[rgba(10,28,41,0.96)] shadow-[-10px_0_40px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
          <h2 id="cart-title" className="text-lg font-extrabold tracking-[.04em]">
            Tu bolsa <span className="font-medium text-white/60">{count}</span>
          </h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Cerrar bolsa"
            className={`flex size-[38px] items-center justify-center rounded-full border border-white/15 text-white transition hover:border-theme-red ${focusRing}`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {freeShippingFrom !== null && (
          <div className="flex shrink-0 flex-col gap-2 border-b border-white/10 px-4 py-3 text-[13px]">
            <span>
              {missing === 0
                ? "Tu envío es gratis"
                : `Te faltan ${formatPrice(missing, currency)} para envío gratis`}
            </span>
            <span className="h-[5px] overflow-hidden rounded-full bg-white/15">
              <span
                className="block h-full bg-theme-red shadow-[0_0_8px_#ff2448] transition-[width] duration-[350ms]"
                style={{ width: `${percent}%` }}
              />
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <div className="flex flex-col items-start gap-3 px-4 py-10">
              <strong className="text-base">Tu bolsa está vacía</strong>
              <Link
                href="/catalogo"
                onClick={closeCart}
                className={`flex h-11 items-center rounded-full border border-white/20 px-[18px] font-semibold text-white transition hover:border-theme-red ${focusRing}`}
              >
                Ver catálogo
              </Link>
            </div>
          ) : (
            <ul>
              {lines.map((line) => {
                const product = products.find((item) => item.id === line.productId);
                if (!product) return null;
                const key = lineKey(line);
                const image = lineImage(product, line.color);
                const total = lineTotal(line, products);
                const stock = product.stock[line.size] ?? 0;
                return (
                  <li
                    key={key}
                    className="grid grid-cols-[72px_1fr_auto] gap-3 border-b border-white/[0.07] px-4 py-3"
                  >
                    <span
                      className="relative block h-[90px] w-[72px] overflow-hidden rounded-[10px]"
                      style={{
                        background: `linear-gradient(160deg, ${CATALOG_COLOR_HEX[line.color]} 0%, #0a1c29 100%)`,
                      }}
                    >
                      {image && (
                        <Image
                          src={image.url}
                          alt=""
                          width={144}
                          height={180}
                          unoptimized
                          className="absolute inset-0 size-full object-cover"
                        />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link
                        href={`/catalogo/${product.id}`}
                        onClick={closeCart}
                        className={`break-words text-sm font-semibold hover:underline ${focusRing}`}
                      >
                        {product.name}
                      </Link>
                      <span className="text-xs text-white/65">
                        {line.color} · {line.size}
                      </span>
                      <div className="mt-auto flex w-max items-center rounded-full border border-white/20">
                        <button
                          type="button"
                          aria-label={
                            line.qty === 1 ? `Quitar ${product.name}` : `Menos ${product.name}`
                          }
                          onClick={() => (line.qty === 1 ? remove(key) : setQty(key, line.qty - 1))}
                          className={`${stepButton} rounded-l-full`}
                        >
                          −
                        </button>
                        <span
                          className="w-6 text-center text-[13px] font-bold"
                          aria-label={`Cantidad ${line.qty}`}
                        >
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`Más ${product.name}`}
                          disabled={line.qty >= stock}
                          onClick={() => setQty(key, line.qty + 1)}
                          className={`${stepButton} rounded-r-full`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <span className="text-sm font-bold">
                        {total === null ? "Consultar" : formatPrice(total, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(key)}
                        aria-label={`Quitar ${product.name} de la bolsa`}
                        className={`py-1 text-xs font-semibold text-[#ff5a63] ${focusRing}`}
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <CartToast toast={toast} onClose={dismissToast} inline />

        <div className="flex shrink-0 flex-col gap-2.5 border-t border-white/10 p-4">
          <div className="flex justify-between text-base">
            <span>Subtotal</span>
            <strong>{formatPrice(subtotal, currency)}</strong>
          </div>
          {unpriced && (
            <span className="text-xs text-white/65">Sin contar los productos a consultar.</span>
          )}
          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            className={`flex h-[52px] items-center justify-center gap-2 rounded-full border border-theme-red bg-theme-red text-[15px] font-bold text-white transition hover:shadow-[0_0_20px_rgba(216,26,33,0.5)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-none ${focusRing}`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
            Enviar pedido por WhatsApp
          </button>
          {whatsapp === "" && (
            <span className="text-xs text-white/75">
              Pedidos por WhatsApp no disponibles por ahora.
            </span>
          )}
        </div>
      </div>
    </dialog>
    {!open && <CartToast toast={toast} onClose={dismissToast} />}
    </>
  );
}
