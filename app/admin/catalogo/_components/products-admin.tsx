"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  moveProduct,
  setProductVisible,
  type CatalogActionResult,
} from "@/app/admin/catalogo/actions";
import {
  chipClass,
  focusRing,
  iconButton,
  inputClass,
  panel,
  primaryButton,
  Switch,
  Thumb,
  Toast,
  useToast,
} from "@/app/admin/_components/ui";
import {
  CATALOG_COLOR_HEX,
  formatPrice,
  normalizeText,
  stockTotal,
  type Catalog,
} from "@/lib/catalog-shared";
import { MAX_PRODUCTS } from "@/lib/content-limits";

const COLUMNS =
  "grid-cols-[52px_minmax(0,1fr)_auto_auto] min-[900px]:grid-cols-[52px_minmax(0,2fr)_1fr_1fr_1.2fr_70px_auto]";

export default function ProductsAdmin({
  initial,
  initialCategory,
}: {
  initial: Catalog;
  initialCategory: string | null;
}) {
  const [catalog, setCatalog] = useState(initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [busy, startTransition] = useTransition();
  const { toast, show, hide } = useToast();

  const categoryName = useMemo(
    () => new Map(catalog.categories.map((c) => [c.id, c.name])),
    [catalog.categories],
  );
  const filtered = catalog.products.filter(
    (product) =>
      (category === null || product.categoryId === category) &&
      (!query || normalizeText(product.name).includes(normalizeText(query))),
  );
  const isFiltered = category !== null || query !== "";
  const visibleCount = catalog.products.filter((product) => product.visible).length;
  const full = catalog.products.length >= MAX_PRODUCTS;

  function run(action: () => Promise<CatalogActionResult>, okMessage?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setCatalog(result.catalog);
        if (okMessage) show(okMessage);
      } else {
        show(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold tracking-wide">Productos</h1>
          <p className="text-[13px] text-white/70">
            {catalog.products.length} productos · {visibleCount} visibles
          </p>
        </div>
        {full ? (
          <span
            aria-disabled="true"
            className="inline-flex items-center rounded-full border border-theme-red bg-theme-red px-5 py-2.5 text-sm font-semibold opacity-45"
          >
            Nuevo producto (máx. {MAX_PRODUCTS})
          </span>
        ) : (
          <Link href="/admin/catalogo/producto/nuevo" className={primaryButton}>
            <span aria-hidden="true">+</span> Nuevo producto
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex-1 basis-56 sm:max-w-sm">
          <span className="sr-only">Buscar producto</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar producto"
            className={`${inputClass} !h-10 !rounded-full`}
          />
        </label>
        <div className="flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <button type="button" onClick={() => setCategory(null)} className={chipClass(category === null)}>
            Todos
          </button>
          {catalog.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={chipClass(category === c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className={`${panel} overflow-hidden`}>
        <div
          className={`hidden gap-3.5 border-b border-border-soft px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-white/60 min-[900px]:grid ${COLUMNS}`}
        >
          <span />
          <span>Producto</span>
          <span>Precio</span>
          <span>Stock</span>
          <span>Fotos</span>
          <span>Visible</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <p className="px-4 py-7 text-sm text-white/70">
            {catalog.products.length === 0
              ? "Aún no hay productos. Crea el primero con «Nuevo producto»."
              : "Ningún producto coincide con la búsqueda."}
          </p>
        )}

        <ul>
          {filtered.map((product) => {
            const total = stockTotal(product);
            const index = catalog.products.findIndex((p) => p.id === product.id);
            const href = `/admin/catalogo/producto/${product.id}`;
            const priceLabel =
              product.price === null ? "Sin precio" : formatPrice(product.price, catalog.currency);
            const stockLabel = total === 0 ? "Agotado" : `${total} uds`;
            const categoryLabel = product.categoryId
              ? (categoryName.get(product.categoryId) ?? "Sin categoría")
              : "Sin categoría";
            return (
              <li
                key={product.id}
                className={`grid items-center gap-3.5 border-b border-white/[0.07] px-4 py-2.5 last:border-b-0 hover:bg-white/[0.04] ${COLUMNS}`}
              >
                <Link
                  href={href}
                  aria-label={`Editar ${product.name}`}
                  className={`block h-[65px] w-[52px] overflow-hidden rounded-[10px] border border-white/15 ${product.visible ? "" : "opacity-50"} ${focusRing}`}
                >
                  <Thumb image={product.images[0]} alt="" className="size-full" size={52} />
                </Link>
                <Link
                  href={href}
                  className={`flex min-w-0 flex-col gap-0.5 ${product.visible ? "" : "opacity-50"} ${focusRing}`}
                >
                  <span className="truncate text-sm font-semibold">{product.name}</span>
                  <span className="truncate text-xs text-white/65">
                    <span className="min-[900px]:hidden">
                      {priceLabel} · {stockLabel} · {product.images.length} fotos
                    </span>
                    <span className="hidden min-[900px]:inline">{categoryLabel}</span>
                  </span>
                </Link>
                <span className="hidden text-sm font-semibold min-[900px]:block">{priceLabel}</span>
                <span
                  className={`hidden text-[13px] font-semibold min-[900px]:block ${
                    total === 0 ? "text-[#ff5a63]" : total <= 6 ? "text-[#ffb0b4]" : ""
                  }`}
                >
                  {stockLabel}
                </span>
                <span className="hidden items-center gap-[3px] min-[900px]:flex">
                  {product.images.slice(0, 4).map((image) => (
                    <span
                      key={image.url}
                      className="h-[25px] w-5 overflow-hidden rounded border border-white/15"
                      style={{ background: CATALOG_COLOR_HEX[image.color] }}
                    >
                      <Thumb image={image} alt="" className="size-full" size={20} />
                    </span>
                  ))}
                  <span className="ml-1 text-xs text-white/65">{product.images.length}</span>
                </span>
                <Switch
                  checked={product.visible}
                  label={`Visible en la tienda: ${product.name}`}
                  disabled={busy}
                  onChange={(next) =>
                    run(
                      () => setProductVisible(product.id, next),
                      next ? `${product.name} visible en la tienda` : `${product.name} oculto`,
                    )
                  }
                />
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Subir ${product.name}`}
                    disabled={busy || isFiltered || index === 0}
                    onClick={() => run(() => moveProduct(product.id, -1))}
                    className={iconButton}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${product.name}`}
                    disabled={busy || isFiltered || index === catalog.products.length - 1}
                    onClick={() => run(() => moveProduct(product.id, 1))}
                    className={iconButton}
                  >
                    ↓
                  </button>
                  <Link
                    href={href}
                    className={`hidden rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold transition hover:border-theme-red min-[900px]:inline-flex ${focusRing}`}
                  >
                    Editar
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {isFiltered && catalog.products.length > 1 && (
        <p className="text-xs text-white/60">
          Quita la búsqueda y el filtro de categoría para reordenar los productos.
        </p>
      )}
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
