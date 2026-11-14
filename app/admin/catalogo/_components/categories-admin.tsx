"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveCategories, type CatalogActionResult } from "@/app/admin/catalogo/actions";
import {
  ConfirmDialog,
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
  normalizeText,
  type Catalog,
  type CatalogCategory,
} from "@/lib/catalog-shared";
import { MAX_CATEGORIES, MAX_CATEGORY_NAME } from "@/lib/content-limits";

type Pending =
  | { kind: "delete"; category: CatalogCategory }
  | { kind: "single-off"; category: CatalogCategory }
  | null;

export default function CategoriesAdmin({ initial }: { initial: Catalog }) {
  const [catalog, setCatalog] = useState(initial);
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending>(null);
  const [busy, startTransition] = useTransition();
  const { toast, show, hide } = useToast();

  const full = catalog.categories.length >= MAX_CATEGORIES;
  const uncategorized = catalog.products.filter((p) => p.categoryId === null).length;

  function save(next: CatalogCategory[], okMessage: string, onOk?: () => void) {
    startTransition(async () => {
      const result: CatalogActionResult = await saveCategories(next);
      if (result.ok) {
        setCatalog(result.catalog);
        onOk?.();
        show(okMessage);
      } else {
        show(result.error);
      }
    });
  }

  function nameError(name: string, ignoreId?: string): string | null {
    if (!name) return "Escribe un nombre para la categoría.";
    if (name.length > MAX_CATEGORY_NAME) return `Máximo ${MAX_CATEGORY_NAME} caracteres.`;
    if (
      catalog.categories.some(
        (c) => c.id !== ignoreId && normalizeText(c.name) === normalizeText(name),
      )
    ) {
      return `Ya existe «${name}».`;
    }
    return null;
  }

  function create() {
    const name = newName.trim().replace(/\s+/g, " ");
    const error = nameError(name);
    if (error) return show(error);
    save(
      [...catalog.categories, { id: crypto.randomUUID(), name, oneSize: false }],
      `Categoría «${name}» creada`,
      () => setNewName(""),
    );
  }

  function commitRename(category: CatalogCategory) {
    const raw = edits[category.id];
    if (raw === undefined) return;
    const name = raw.trim().replace(/\s+/g, " ");
    const clear = () =>
      setEdits((current) => {
        const { [category.id]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
    if (!name || name === category.name) return clear();
    const error = nameError(name, category.id);
    if (error) {
      show(error);
      return clear();
    }
    save(
      catalog.categories.map((c) => (c.id === category.id ? { ...c, name } : c)),
      "Categoría renombrada",
      clear,
    );
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= catalog.categories.length) return;
    const next = [...catalog.categories];
    [next[index], next[target]] = [next[target], next[index]];
    save(next, "Orden actualizado");
  }

  function setOneSize(category: CatalogCategory, oneSize: boolean) {
    save(
      catalog.categories.map((c) => (c.id === category.id ? { ...c, oneSize } : c)),
      oneSize ? "Talla única activada" : "Talla única desactivada",
    );
  }

  return (
    <>
      <div>
        <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold tracking-wide">Categorías</h1>
        <p className="text-[13px] text-white/70">
          {catalog.categories.length} de {MAX_CATEGORIES} categorías · los clientes las ven como
          filtros del catálogo
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
        className={`${panel} flex flex-wrap gap-2 border-theme-red/45 p-3`}
      >
        <label className="flex-1 basis-56">
          <span className="sr-only">Nombre de la nueva categoría</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={full || busy}
            maxLength={MAX_CATEGORY_NAME}
            placeholder="Nueva categoría, ej. Chaquetas"
            className={`${inputClass} !h-[46px] !rounded-full !px-[18px]`}
          />
        </label>
        <button type="submit" disabled={full || busy} className={`${primaryButton} !h-[46px]`}>
          <span aria-hidden="true">+</span> Crear categoría
        </button>
      </form>

      <div className={`${panel} overflow-hidden`}>
        {catalog.categories.length === 0 && (
          <p className="px-4 py-7 text-sm text-white/70">
            Aún no hay categorías. Crea la primera arriba.
          </p>
        )}
        <ul>
          {catalog.categories.map((category, index) => {
            const products = catalog.products.filter((p) => p.categoryId === category.id);
            return (
              <li
                key={category.id}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-white/[0.07] px-3.5 py-2.5 last:border-b-0 hover:bg-white/[0.04]"
              >
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={`Subir ${category.name}`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    className={`h-5 w-7 text-sm leading-none text-white disabled:opacity-35 ${focusRing}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${category.name}`}
                    disabled={busy || index === catalog.categories.length - 1}
                    onClick={() => move(index, 1)}
                    className={`h-5 w-7 text-sm leading-none text-white disabled:opacity-35 ${focusRing}`}
                  >
                    ↓
                  </button>
                </span>
                <Thumb
                  image={products[0]?.images[0]}
                  alt=""
                  size={44}
                  className="size-11 shrink-0 rounded-full border border-white/20"
                />
                <div className="flex min-w-0 flex-1 basis-44 flex-col gap-0.5">
                  <input
                    aria-label="Nombre de la categoría"
                    value={edits[category.id] ?? category.name}
                    maxLength={MAX_CATEGORY_NAME}
                    onChange={(event) =>
                      setEdits((current) => ({ ...current, [category.id]: event.target.value }))
                    }
                    onBlur={() => commitRename(category)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        setEdits((current) => {
                          const { [category.id]: _removed, ...rest } = current;
                          void _removed;
                          return rest;
                        });
                      }
                    }}
                    className={`-ml-2 h-[38px] w-full rounded-[10px] border border-transparent bg-transparent px-2 text-[15px] font-bold outline-none hover:border-white/20 focus:border-theme-red focus:bg-black/35 ${focusRing}`}
                  />
                  <Link
                    href={`/admin/catalogo?categoria=${category.id}`}
                    className={`self-start text-xs text-white/65 hover:text-[#ff5a63] ${focusRing}`}
                  >
                    {products.length} {products.length === 1 ? "producto" : "productos"} →
                  </Link>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-white/85">
                  <Switch
                    checked={category.oneSize}
                    label={`Talla única: ${category.name}`}
                    disabled={busy}
                    onChange={(next) =>
                      !next && products.length > 0
                        ? setPending({ kind: "single-off", category })
                        : setOneSize(category, next)
                    }
                  />
                  Talla única
                </label>
                <button
                  type="button"
                  aria-label={`Eliminar categoría ${category.name}`}
                  disabled={busy}
                  onClick={() => setPending({ kind: "delete", category })}
                  className={`${iconButton} hover:!border-theme-red hover:bg-theme-red`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
        {uncategorized > 0 && (
          <p className="border-t border-white/[0.07] px-4 py-3 text-[13px] text-white/70">
            {uncategorized} {uncategorized === 1 ? "producto sin categoría" : "productos sin categoría"}.
            Asígnalos desde su ficha.
          </p>
        )}
      </div>
      <p className="text-xs text-white/60">
        Usa las flechas para cambiar el orden en el catálogo. Haz clic en el nombre para renombrar.
        Si eliminas una categoría, sus productos quedan sin categoría y no se borran.
      </p>

      <ConfirmDialog
        open={pending?.kind === "delete"}
        title="Eliminar categoría"
        confirmLabel="Eliminar"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind !== "delete") return;
          const { category } = pending;
          setPending(null);
          save(
            catalog.categories.filter((c) => c.id !== category.id),
            `«${category.name}» eliminada`,
          );
        }}
      >
        {pending?.kind === "delete" && (
          <p>
            Se eliminará «{pending.category.name}». Sus productos quedan sin categoría y no se
            borran.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "single-off"}
        title="Desactivar talla única"
        confirmLabel="Desactivar"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind !== "single-off") return;
          const { category } = pending;
          setPending(null);
          setOneSize(category, false);
        }}
      >
        <p>
          Los productos de «{pending?.category.name}» pasarán a las tallas XS a XL y su stock
          empezará en 0 (aparecerán como agotados) hasta que lo cargues en cada ficha.
        </p>
      </ConfirmDialog>

      <Toast toast={toast} onClose={hide} />
    </>
  );
}
