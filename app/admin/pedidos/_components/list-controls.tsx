"use client";

import Form from "next/form";
import Link from "next/link";
import { chipClass, ghostButton, inputClass, softButton } from "@/app/admin/_components/ui";
import { ORDERS_PAGE_SIZE } from "@/lib/content-limits";

// Filtros, búsqueda y páginas de las dos pestañas: todo viaja en la URL.
export function listHref(params: Record<string, string>): string {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== ""));
  const text = query.toString();
  return text ? `/admin/pedidos?${text}` : "/admin/pedidos";
}

export function SearchAndFilters({
  base,
  search,
  placeholder,
  filters,
  active,
}: {
  base: Record<string, string>; // parámetros fijos de la pestaña
  search: string;
  placeholder: string;
  filters: { value: string; label: string }[];
  active: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Form action="/admin/pedidos" className="flex max-w-md items-center gap-2">
        {Object.entries({ ...base, estado: active }).map(([name, value]) =>
          value ? <input key={name} type="hidden" name={name} value={value} /> : null,
        )}
        <label className="min-w-0 flex-1">
          <span className="sr-only">{placeholder}</span>
          <input
            key={search}
            type="search"
            name="q"
            defaultValue={search}
            maxLength={80}
            placeholder={placeholder}
            className={`${inputClass} !h-10 !rounded-full`}
          />
        </label>
        <button type="submit" className={softButton}>
          Buscar
        </button>
      </Form>
      <nav aria-label="Filtrar por estado" className="flex gap-1.5 overflow-x-auto p-1 [scrollbar-width:none]">
        {filters.map((filter) => (
          <Link
            key={filter.value || "todos"}
            href={listHref({ ...base, estado: filter.value, q: search })}
            aria-current={filter.value === active ? "true" : undefined}
            className={chipClass(filter.value === active)}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Pager({
  total,
  page,
  params,
}: {
  total: number;
  page: number;
  params: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  if (pages === 1 && page === 1) return null;
  const href = (target: number) =>
    listHref({ ...params, pagina: target > 1 ? String(target) : "" });
  return (
    <nav aria-label="Páginas" className="flex items-center justify-center gap-3 text-sm">
      {page > 1 && (
        <Link href={href(Math.min(page - 1, pages))} className={ghostButton}>
          ← Anterior
        </Link>
      )}
      <span className="text-white/70">
        Página {page} de {pages}
      </span>
      {page < pages && (
        <Link href={href(page + 1)} className={ghostButton}>
          Siguiente →
        </Link>
      )}
    </nav>
  );
}
