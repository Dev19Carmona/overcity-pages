"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

const ITEMS = [
  { href: "/admin", label: "Página de links", group: "Sitio", match: (p: string) => p === "/admin" },
  {
    href: "/admin/catalogo",
    label: "Productos",
    group: "Catálogo",
    match: (p: string) => p === "/admin/catalogo" || p.startsWith("/admin/catalogo/producto"),
  },
  {
    href: "/admin/catalogo/categorias",
    label: "Categorías",
    group: "Catálogo",
    match: (p: string) => p.startsWith("/admin/catalogo/categorias"),
  },
  {
    href: "/admin/catalogo/ajustes",
    label: "Ajustes del catálogo",
    group: "Catálogo",
    match: (p: string) => p.startsWith("/admin/catalogo/ajustes"),
  },
];

// Navegación del panel: columna a la izquierda en escritorio (con títulos de grupo),
// fila con scroll interno en móvil.
export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones del panel"
      className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] min-[900px]:flex-col min-[900px]:overflow-visible"
    >
      {ITEMS.map((item, index) => {
        const active = item.match(pathname);
        const newGroup = index === 0 || ITEMS[index - 1].group !== item.group;
        return (
          <div key={item.href} className="contents">
            {newGroup && (
              <span
                aria-hidden="true"
                className="hidden px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[.08em] text-white/50 min-[900px]:block"
              >
                {item.group}
              </span>
            )}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/5 ${focusRing} ${
                active ? "border-theme-red/50 bg-theme-red/20" : "border-transparent"
              }`}
            >
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
