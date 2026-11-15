"use client";

import Image from "next/image";
import { useState } from "react";
import { useCart } from "@/app/_components/cart-provider";
import { buildInquiryMessage, whatsappUrl } from "@/lib/cart";
import {
  CATALOG_COLOR_HEX,
  colorStock,
  formatPrice,
  stockOf,
  type CatalogColor,
  type CatalogCurrency,
  type CatalogProduct,
} from "@/lib/catalog-shared";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

const arrowButton = `absolute top-1/2 flex size-[42px] -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white transition hover:border-theme-red ${focusRing}`;

// Galería por color, selector de color (tachado si no tiene stock en ninguna talla) y de talla
// (tachada según el stock del color elegido), cantidad, botón para agregar a la bolsa y consulta
// por WhatsApp (SPEC 08, SPEC 09).
export default function ProductDetail({
  product,
  categoryName,
  currency,
}: {
  product: CatalogProduct;
  categoryName: string | null;
  currency: CatalogCurrency;
}) {
  // Color inicial: el primero con stock; si ninguno tiene, el primero.
  const [color, setColor] = useState<CatalogColor>(
    () => product.colors.find((c) => colorStock(product, c) > 0) ?? product.colors[0],
  );
  const [index, setIndex] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [wantedQty, setWantedQty] = useState(1);
  const { add, openCart, catalog } = useCart();

  const byColor = product.images.filter((image) => image.color === color);
  const images = byColor.length > 0 ? byColor : product.images;
  const current = images[Math.min(index, images.length - 1)];
  const position = Math.min(index, images.length - 1);
  // Tallas del producto (las mismas en todos los colores) y existencia del color elegido.
  const sizes = Object.keys(product.stock[product.colors[0]] ?? {});
  const soldOut = colorStock(product, color) === 0;
  const units = size ? stockOf(product, color, size) : 0;
  const sizeMessage = soldOut
    ? "Agotado"
    : !size
      ? "Elige tu talla"
      : units <= 3
        ? `¡Quedan ${units}!`
        : "Disponible";

  // La cantidad nunca pasa del stock de la combinación color + talla elegida.
  const qty = Math.max(1, Math.min(wantedQty, units || 1));
  const canAdd = !soldOut && size !== null && units > 0;
  const addLabel = soldOut
    ? "Agotado"
    : !size
      ? "Elige una talla"
      : product.price === null
        ? "Agregar a la bolsa"
        : `Agregar a la bolsa · ${formatPrice(product.price * qty, currency)}`;

  function addToCart() {
    if (!canAdd || !size) return;
    add({ productId: product.id, color, size, qty });
    openCart();
  }

  function ask() {
    const text = buildInquiryMessage(
      product,
      { color, size },
      catalog.brandName,
      window.location.origin,
    );
    window.open(whatsappUrl(catalog.whatsapp, text), "_blank", "noopener,noreferrer");
  }

  function go(step: number) {
    setIndex((position + step + images.length) % images.length);
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-start gap-[clamp(18px,3vw,44px)]">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div
          className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border-soft"
          style={{
            background: `linear-gradient(160deg, ${CATALOG_COLOR_HEX[current.color]} 0%, #0a1c29 100%)`,
          }}
        >
          <Image
            key={current.url}
            src={current.url}
            alt={`${product.name}, ${current.color}, imagen ${position + 1}`}
            width={800}
            height={1000}
            unoptimized
            priority
            className="absolute inset-0 size-full object-cover"
          />
          {images.length > 1 && (
            <>
              <button type="button" aria-label="Imagen anterior" onClick={() => go(-1)} className={`${arrowButton} left-2.5`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button type="button" aria-label="Imagen siguiente" onClick={() => go(1)} className={`${arrowButton} right-2.5`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          )}
          <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold">
            {position + 1} / {images.length}
          </span>
        </div>
        {images.length > 1 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
            {images.map((image, i) => (
              <li key={image.url} className="min-w-0">
                <button
                  type="button"
                  aria-label={`Ver imagen ${i + 1}`}
                  aria-current={i === position}
                  onClick={() => setIndex(i)}
                  className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[10px] border-2 transition-opacity ${focusRing} ${
                    i === position ? "border-theme-red" : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <Image
                    src={image.url}
                    alt=""
                    width={96}
                    height={120}
                    unoptimized
                    className="absolute inset-0 size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-[18px] min-[900px]:sticky min-[900px]:top-20">
        <div className="flex flex-col gap-1.5">
          {categoryName && (
            <span className="text-xs font-semibold uppercase tracking-[.08em] text-white/75">
              {categoryName}
            </span>
          )}
          <h1 className="break-words text-[clamp(24px,3vw,34px)] font-extrabold leading-[1.15] tracking-[.04em] [text-shadow:0_0_14px_rgba(216,26,33,0.45)]">
            {product.name}
          </h1>
          {product.price !== null && (
            <span className="text-[22px] font-bold text-[#ff3b45]">
              {formatPrice(product.price, currency)}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="text-[13px]">
            Color: <strong>{color}</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.colors.map((c) => {
              const out = colorStock(product, c) === 0;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={c === color}
                  aria-label={out ? `${c}, agotado` : c}
                  onClick={() => {
                    setColor(c);
                    setIndex(0);
                    // Una talla sin stock en el nuevo color se deselecciona.
                    if (size && stockOf(product, c, size) === 0) setSize(null);
                  }}
                  className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold text-white transition hover:border-theme-red ${focusRing} ${
                    c === color ? "border-theme-red bg-theme-red/25" : "border-white/15 bg-black/35"
                  } ${out ? "line-through opacity-60" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className="size-6 rounded-full border border-white/40"
                    style={{ background: CATALOG_COLOR_HEX[c] }}
                  />
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between text-[13px]">
            <span>Talla</span>
            <span role="status" className="font-semibold text-[#ff5a63]">
              {sizeMessage}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
            {sizes.map((s) => {
              const out = stockOf(product, color, s) === 0;
              const on = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={out}
                  aria-pressed={on}
                  aria-label={out ? `Talla ${s}, agotada` : `Talla ${s}`}
                  onClick={() => setSize(s)}
                  className={`h-12 rounded-xl border text-[15px] font-bold text-white transition hover:border-theme-red disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 disabled:hover:border-white/20 ${focusRing} ${
                    on ? "border-theme-red bg-theme-red" : "border-white/20 bg-black/30"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-white/20">
              <button
                type="button"
                aria-label="Menos cantidad"
                disabled={qty <= 1}
                onClick={() => setWantedQty(qty - 1)}
                className={`size-11 rounded-l-full text-lg text-white disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
              >
                −
              </button>
              <span className="w-8 text-center text-[15px] font-bold" aria-label={`Cantidad ${qty}`}>
                {qty}
              </span>
              <button
                type="button"
                aria-label="Más cantidad"
                disabled={!canAdd || qty >= units}
                onClick={() => setWantedQty(qty + 1)}
                className={`size-11 rounded-r-full text-lg text-white disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!canAdd}
              onClick={addToCart}
              className={`h-[52px] min-w-0 flex-1 basis-56 rounded-full border border-theme-red bg-theme-red px-5 text-[15px] font-bold text-white transition hover:shadow-[0_0_20px_rgba(216,26,33,0.5)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-none ${focusRing}`}
            >
              {addLabel}
            </button>
          </div>
          {catalog.whatsapp !== "" && (
            <button
              type="button"
              onClick={ask}
              className={`flex h-12 items-center justify-center gap-2 rounded-full border border-theme-red bg-theme-red/20 px-5 text-sm font-bold text-white transition hover:bg-theme-red/40 ${focusRing}`}
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
              Preguntar por WhatsApp
            </button>
          )}
        </div>

        {product.description && (
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-white/90">
            {product.description}
          </p>
        )}
      </div>
    </div>
  );
}
