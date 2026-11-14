"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  CATALOG_COLOR_HEX,
  formatPrice,
  normalizeText,
  stockTotal,
  type Catalog,
  type CatalogCurrency,
  type CatalogProduct,
} from "@/lib/catalog-shared";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

type Sort = "rel" | "asc" | "desc";

const SORTS: { value: Sort; label: string }[] = [
  { value: "rel", label: "Destacados" },
  { value: "asc", label: "Precio: menor" },
  { value: "desc", label: "Precio: mayor" },
];

function chip(active: boolean) {
  return `shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold text-white transition hover:border-theme-red ${focusRing} ${
    active ? "border-theme-red bg-theme-red/25" : "border-white/15 bg-black/35"
  }`;
}

function ProductCard({
  product,
  currency,
}: {
  product: CatalogProduct;
  currency: CatalogCurrency;
}) {
  const cover = product.images[0];
  const second = product.images[1];
  const soldOut = stockTotal(product) === 0;
  return (
    <Link
      href={`/catalogo/${product.id}`}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-black/30 text-left backdrop-blur-md transition-all duration-300 hover:border-theme-red hover:shadow-[0_0_15px_rgba(216,26,33,0.3)] motion-safe:hover:-translate-y-1 ${focusRing}`}
    >
      <div
        className="relative aspect-[4/5] w-full overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${CATALOG_COLOR_HEX[cover.color]} 0%, #0a1c29 100%)`,
        }}
      >
        <Image
          src={cover.url}
          alt={product.name}
          width={480}
          height={600}
          unoptimized
          className="absolute inset-0 size-full object-cover"
        />
        {second && (
          <Image
            src={second.url}
            alt=""
            width={480}
            height={600}
            unoptimized
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
        )}
        {soldOut && (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-white/25 bg-black/65 px-2.5 py-[3px] text-[11px] font-bold">
            AGOTADO
          </span>
        )}
        <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px]">
          {product.images.length} {product.images.length === 1 ? "foto" : "fotos"}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        <span className="break-words text-sm font-semibold leading-snug">{product.name}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-[#ff3b45]">
            {product.price === null ? "" : formatPrice(product.price, currency)}
          </span>
          <span className="flex gap-1" aria-label={`Colores: ${product.colors.join(", ")}`}>
            {product.colors.map((color) => (
              <span
                key={color}
                title={color}
                className="size-3 rounded-full border border-white/40"
                style={{ background: CATALOG_COLOR_HEX[color] }}
              />
            ))}
          </span>
        </div>
      </div>
    </Link>
  );
}

function Browser({
  catalog,
  initialCategory,
}: {
  catalog: Catalog;
  initialCategory: string | null;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("rel");
  const [category, setCategory] = useState<string | null>(initialCategory);

  const { products, categories, currency } = catalog;
  const chips = categories
    .map((c) => ({ ...c, count: products.filter((p) => p.categoryId === c.id).length }))
    .filter((c) => c.count > 0);

  const needle = normalizeText(query.trim());
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  let list = products.filter(
    (product) =>
      (category === null || product.categoryId === category) &&
      (!needle ||
        normalizeText(`${product.name} ${categoryName.get(product.categoryId ?? "") ?? ""}`).includes(
          needle,
        )),
  );
  if (sort !== "rel") {
    const direction = sort === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1; // sin precio siempre al final
      if (b.price === null) return -1;
      return (a.price - b.price) * direction;
    });
  }

  function clearFilters() {
    setQuery("");
    setCategory(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <h1 className="premium-heading !justify-start text-[clamp(22px,3vw,32px)] font-extrabold">
          <span className="oni-mask" aria-hidden="true">👺</span>
          <span>{catalog.title}</span>
          <span className="oni-mask" aria-hidden="true">👹</span>
        </h1>
        {products.length > 0 && (
          <div className="flex w-full min-w-0 gap-2 min-[560px]:max-w-[520px] min-[560px]:flex-1 min-[560px]:basis-72">
            <label className="flex h-[42px] min-w-0 flex-1 items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3.5 backdrop-blur-md focus-within:border-theme-red">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <span className="sr-only">Buscar productos</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar productos…"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/55"
              />
            </label>
            <select
              aria-label="Ordenar"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className={`h-[42px] max-w-[45%] shrink-0 rounded-full border border-white/15 bg-black/35 px-3 text-[13px] text-white ${focusRing}`}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value} className="bg-theme-navy">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <p className="py-10 text-center text-sm">Todavía no hay productos disponibles.</p>
      ) : (
        <>
          <div className="sticky top-[59px] z-10 -mx-[clamp(14px,3vw,32px)] bg-gradient-to-b from-theme-navy/90 to-theme-navy/55 px-[clamp(14px,3vw,32px)] py-2 backdrop-blur-[8px]">
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
              <button type="button" onClick={() => setCategory(null)} className={chip(category === null)}>
                Todos <span className="font-medium opacity-60">{products.length}</span>
              </button>
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={chip(category === c.id)}
                >
                  {c.name} <span className="font-medium opacity-60">{c.count}</span>
                </button>
              ))}
            </div>
          </div>

          <p role="status" className="text-[13px] text-white/75">
            {list.length} {list.length === 1 ? "producto" : "productos"}
            {query.trim() ? ` para «${query.trim()}»` : ""}
          </p>

          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-white/25 px-5 py-10 text-center">
              <strong>Nada por aquí</strong>
              <span className="text-sm text-white/75">Prueba otra búsqueda o categoría.</span>
              <button
                type="button"
                onClick={clearFilters}
                className={`rounded-full border border-white/25 px-4 py-2 text-sm font-semibold transition hover:border-theme-red ${focusRing}`}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(44%,240px),1fr))] gap-[clamp(10px,1.6vw,18px)]">
              {list.map((product) => (
                <li key={product.id} className="min-w-0">
                  <ProductCard product={product} currency={currency} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

// Lee ?categoria=<id> (viene de los botones de la home); con otro valor se reinicia el filtro.
function WithParams({ catalog }: { catalog: Catalog }) {
  const param = useSearchParams().get("categoria");
  const valid = param !== null && catalog.categories.some((c) => c.id === param) ? param : null;
  return <Browser key={valid ?? ""} catalog={catalog} initialCategory={valid} />;
}

export default function CatalogBrowser({ catalog }: { catalog: Catalog }) {
  return (
    // El respaldo ya es la vista completa (sin filtro), así el HTML inicial trae los productos.
    <Suspense fallback={<Browser catalog={catalog} initialCategory={null} />}>
      <WithParams catalog={catalog} />
    </Suspense>
  );
}
