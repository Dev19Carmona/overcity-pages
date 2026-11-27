"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  saveCategories,
  saveProduct,
} from "@/app/admin/catalogo/actions";
import ProductDesigns from "@/app/admin/catalogo/_components/product-designs";
import {
  ConfirmDialog,
  focusRing,
  ghostButton,
  inputClass,
  labelClass,
  panel,
  primaryButton,
  Switch,
  Toast,
  useToast,
} from "@/app/admin/_components/ui";
import {
  colorHex,
  colorStock,
  designStock,
  formatPrice,
  resizeStock,
  sizesFor,
  stockTotal,
  type CatalogCategory,
  type CatalogColorDef,
  type CatalogCurrency,
  type CatalogDesign,
  type CatalogProduct,
} from "@/lib/catalog-shared";
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_PRICE,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PRODUCT_NAME,
  MAX_STOCK,
} from "@/lib/content-limits";
import { normalizeText } from "@/lib/catalog-shared";
import { comboKey } from "@/lib/orders-shared";

const NEW_CATEGORY = "__new";

// Ajusta el stock de todos los diseños a las tallas de la categoría.
function resizeDesigns(designs: CatalogDesign[], sizes: string[]): CatalogDesign[] {
  return designs.map((design) => ({
    ...design,
    stock: resizeStock(design.stock, design.colors, sizes),
  }));
}

function blankProduct(categories: CatalogCategory[]): CatalogProduct {
  const first = categories[0] ?? null;
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    price: null,
    categoryId: first?.id ?? null,
    visible: true,
    designs: [],
  };
}

export default function ProductEditor({
  meta,
  product,
  version: initialVersion,
  reserved,
}: {
  meta: { categories: CatalogCategory[]; colors: CatalogColorDef[]; currency: CatalogCurrency };
  product: CatalogProduct | null; // null = producto nuevo
  version: number | null; // versión guardada al abrir la ficha; null = producto nuevo
  reserved: Record<string, number>; // unidades reservadas por pedidos, por `comboKey` (SPEC 17)
}) {
  const router = useRouter();
  const catalog = meta;
  const [categories, setCategories] = useState(meta.categories);
  const [saved, setSaved] = useState<CatalogProduct | null>(product);
  // Control optimista (SPEC 12): la versión con la que se abrió o se guardó por última vez la ficha.
  const [version, setVersion] = useState<number | null>(initialVersion);
  const [draft, setDraft] = useState<CatalogProduct>(() => product ?? blankProduct(meta.categories));
  const [uploading, setUploading] = useState(false);
  const [quickCategory, setQuickCategory] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const { toast, show, hide } = useToast();

  const dirty = saved === null || JSON.stringify(saved) !== JSON.stringify(draft);
  const category = categories.find((c) => c.id === draft.categoryId) ?? null;
  const sizes = sizesFor(category);
  const canAddCategory = categories.length < MAX_CATEGORIES;

  // Aviso del navegador al cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function patch(next: Partial<CatalogProduct>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function changeCategory(categoryId: string | null) {
    const next = categories.find((c) => c.id === categoryId) ?? null;
    setDraft((current) => ({
      ...current,
      categoryId,
      designs: resizeDesigns(current.designs, sizesFor(next)),
    }));
  }

  function createCategory() {
    const name = (quickCategory ?? "").trim().replace(/\s+/g, " ");
    if (!name) return show("Escribe un nombre para la categoría.");
    if (categories.some((c) => normalizeText(c.name) === normalizeText(name))) {
      return show(`Ya existe «${name}».`);
    }
    const created: CatalogCategory = { id: crypto.randomUUID(), name, oneSize: false };
    startSaving(async () => {
      const result = await saveCategories([...categories, created]);
      if (result.ok) {
        setCategories(result.list.categories);
        setQuickCategory(null);
        changeCategoryTo(created);
        show(`Categoría «${name}» creada`);
      } else {
        show(result.error);
      }
    });
  }

  function changeCategoryTo(next: CatalogCategory) {
    setDraft((current) => ({
      ...current,
      categoryId: next.id,
      designs: resizeDesigns(current.designs, sizesFor(next)),
    }));
  }

  function save() {
    if (!draft.name.trim()) return show("Ponle un nombre al producto.");
    if (draft.designs.length === 0) return show("Sube al menos un diseño.");
    const names = new Set<string>();
    for (const design of draft.designs) {
      const name = design.name.trim();
      if (!name) return show("Todos los diseños necesitan un nombre.");
      if (names.has(normalizeText(name))) return show(`Hay dos diseños llamados «${name}».`);
      names.add(normalizeText(name));
    }
    startSaving(async () => {
      const result = await saveProduct(
        {
          ...draft,
          name: draft.name.trim(),
          designs: draft.designs.map((design) => ({ ...design, name: design.name.trim() })),
        },
        version,
      );
      if (result.ok) {
        const stored = result.product;
        setSaved(stored);
        setDraft(stored);
        setVersion(result.version);
        if (product === null) {
          window.history.replaceState(null, "", `/admin/catalogo/producto/${stored.id}`);
        }
        show("Cambios guardados");
      } else {
        show(result.error);
      }
    });
  }

  function discard() {
    if (saved) {
      setDraft(saved);
      show("Cambios descartados");
    } else {
      router.push("/admin/catalogo");
    }
  }

  function back() {
    if (dirty) setLeaveOpen(true);
    else router.push("/admin/catalogo");
  }

  const status = uploading
    ? "Subiendo diseños…"
    : dirty
      ? "Cambios sin guardar"
      : "Todo guardado";

  return (
    <>
      <div className="sticky top-[62px] z-20 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border-soft bg-theme-navy/85 px-3 py-2.5 backdrop-blur-[14px] min-[900px]:top-3">
        <button
          type="button"
          aria-label="Volver a productos"
          onClick={back}
          className={`inline-flex size-[38px] shrink-0 items-center justify-center rounded-full border border-white/15 hover:border-theme-red ${focusRing}`}
        >
          ←
        </button>
        <div className="min-w-[120px] flex-1">
          <div className="truncate text-base font-bold">{draft.name || "Producto nuevo"}</div>
          <div
            className={`flex items-center gap-1.5 text-xs ${dirty ? "text-[#ff5a63]" : "text-white/65"}`}
          >
            <span
              aria-hidden="true"
              className={`size-[7px] rounded-full ${dirty ? "bg-[#ff5a63]" : "bg-white/60"}`}
            />
            {status}
          </div>
        </div>
        {saved && saved.visible && (
          <Link href={`/catalogo/${saved.id}`} className={`${ghostButton} !h-[38px] !px-3.5 !text-[13px]`}>
            Ver en tienda
          </Link>
        )}
        {dirty && (
          <button
            type="button"
            onClick={discard}
            className={`${ghostButton} !h-[38px] !px-3.5 !text-[13px]`}
          >
            Descartar
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || uploading || saving}
          className={`${primaryButton} !h-[38px] !px-[18px] !text-[13px]`}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <ProductDesigns
        designs={draft.designs}
        palette={catalog.colors}
        sizes={sizes}
        onChange={(update) =>
          setDraft((current) => ({ ...current, designs: update(current.designs) }))
        }
        onBusyChange={setUploading}
        notify={show}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
        <section className={`${panel} flex flex-col gap-3 p-4`}>
          <h2 className="text-[17px] font-bold">Información</h2>
          <label className={labelClass}>
            Nombre
            <input
              value={draft.name}
              maxLength={MAX_PRODUCT_NAME}
              placeholder="Ej. Camisa Oversize Oni"
              onChange={(event) => patch({ name: event.target.value })}
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Precio ({catalog.currency})
              <input
                value={draft.price === null ? "" : String(draft.price)}
                inputMode="numeric"
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  patch({ price: digits ? Math.min(parseInt(digits, 10), MAX_PRICE) : null });
                }}
                className={inputClass}
              />
              <span className="font-medium text-white/60">
                {draft.price === null ? "Sin precio" : formatPrice(draft.price, catalog.currency)}
              </span>
            </label>
            <label className={labelClass}>
              Categoría
              <select
                value={draft.categoryId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === NEW_CATEGORY) setQuickCategory("");
                  else changeCategory(value || null);
                }}
                className={inputClass}
              >
                <option value="" className="bg-theme-navy">
                  Sin categoría
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-theme-navy">
                    {c.name}
                  </option>
                ))}
                {canAddCategory && (
                  <option value={NEW_CATEGORY} className="bg-theme-navy">
                    + Crear categoría…
                  </option>
                )}
              </select>
            </label>
          </div>
          {quickCategory !== null && (
            <div className="flex items-center gap-2 rounded-xl border border-theme-red/50 bg-theme-red/10 p-2.5">
              <input
                autoFocus
                aria-label="Nombre de la nueva categoría"
                value={quickCategory}
                maxLength={MAX_CATEGORY_NAME}
                placeholder="Nombre de la nueva categoría"
                onChange={(event) => setQuickCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createCategory();
                  }
                  if (event.key === "Escape") setQuickCategory(null);
                }}
                className={`${inputClass} !h-10 !rounded-full`}
              />
              <button type="button" onClick={createCategory} disabled={saving} className={`${primaryButton} !h-10 !px-4 !text-[13px]`}>
                Crear
              </button>
              <button
                type="button"
                aria-label="Cancelar"
                onClick={() => setQuickCategory(null)}
                className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 ${focusRing}`}
              >
                ×
              </button>
            </div>
          )}
          <label className={labelClass}>
            Descripción
            <textarea
              value={draft.description}
              rows={4}
              maxLength={MAX_PRODUCT_DESCRIPTION}
              onChange={(event) => patch({ description: event.target.value })}
              className={`${inputClass} !h-auto resize-y py-2.5 text-sm leading-normal`}
            />
          </label>
          <div className="flex items-center gap-3 border-t border-white/10 pt-3">
            <span className="flex flex-1 flex-col">
              <strong className="text-sm">Visible en la tienda</strong>
              <span className="text-xs text-white/65">Si lo apagas, se oculta sin borrarlo</span>
            </span>
            <Switch
              checked={draft.visible}
              label="Visible en la tienda"
              onChange={(next) => patch({ visible: next })}
            />
          </div>
        </section>

        <section className={`${panel} flex flex-col gap-3 p-4`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-bold">Stock por diseño, color y talla</h2>
            <span className="text-[13px] text-white/70">{stockTotal(draft)} unidades</span>
          </div>
          {draft.designs.length === 0 && (
            <p className="text-sm text-white/70">Sube al menos un diseño para cargar su stock.</p>
          )}
          {draft.designs.map((design, designIndex) => (
            <details
              key={design.id}
              open={designIndex === 0}
              className="rounded-xl border border-white/15 bg-black/25"
            >
              <summary
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold ${focusRing}`}
              >
                <span className="min-w-0 truncate">{design.name || `Diseño ${designIndex + 1}`}</span>
                <span className="shrink-0 text-[13px] font-normal text-white/70">
                  {designStock(design)} uds
                </span>
              </summary>
              {/* La tabla se desplaza dentro de su caja; la página no hace scroll horizontal. */}
              <div className="overflow-x-auto border-t border-white/10">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-[11px] font-bold text-white/70">
                      <th scope="col" className="sticky left-0 z-10 bg-theme-navy px-2.5 py-2">
                        Color
                      </th>
                      {sizes.map((size) => (
                        <th key={size} scope="col" className="px-1.5 py-2 text-center">
                          {size}
                        </th>
                      ))}
                      <th scope="col" className="px-2.5 py-2 text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {design.colors.map((color) => (
                      <tr key={color} className="border-t border-white/10">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-theme-navy px-2.5 py-1.5 text-[13px] font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-4 shrink-0 rounded-full border border-white/40"
                              style={{ background: colorHex(catalog.colors, color) }}
                            />
                            {color}
                          </span>
                        </th>
                        {sizes.map((size) => {
                          const units = design.stock[color]?.[size] ?? 0;
                          const held =
                            reserved[
                              comboKey({ productId: draft.id, designId: design.id, color, size })
                            ] ?? 0;
                          return (
                            <td key={size} className="px-1 py-1.5 text-center align-top">
                              <input
                                aria-label={`Stock ${design.name || designIndex + 1}, ${color}, talla ${size}`}
                                value={String(units)}
                                inputMode="numeric"
                                onChange={(event) => {
                                  const digits = event.target.value.replace(/\D/g, "");
                                  const value = Math.min(digits ? parseInt(digits, 10) : 0, MAX_STOCK);
                                  setDraft((current) => ({
                                    ...current,
                                    designs: current.designs.map((d) =>
                                      d.id === design.id
                                        ? {
                                            ...d,
                                            stock: {
                                              ...d.stock,
                                              [color]: { ...d.stock[color], [size]: value },
                                            },
                                          }
                                        : d,
                                    ),
                                  }));
                                }}
                                className={`h-9 w-14 rounded-lg border bg-black/30 px-1 text-center text-base font-extrabold ${focusRing} ${
                                  units === 0
                                    ? "border-theme-red/50 text-[#ff5a63]"
                                    : "border-white/15 text-white"
                                }`}
                              />
                              {held > 0 && (
                                <span className="mt-1 block whitespace-nowrap text-[11px] font-semibold text-[#ffb0b4]">
                                  {held} {held === 1 ? "reservada" : "reservadas"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2.5 py-1.5 text-right text-[13px] text-white/70">
                          {colorStock(design, color)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/15 text-[13px] font-bold">
                      <th
                        scope="row"
                        colSpan={sizes.length + 1}
                        className="sticky left-0 z-10 bg-theme-navy px-2.5 py-2 text-left"
                      >
                        Total del diseño
                      </th>
                      <td className="px-2.5 py-2 text-right">{designStock(design)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          ))}
          <p className="text-xs text-white/65">
            Las tallas en 0 de cada color aparecen tachadas en la tienda al elegir ese diseño y color.
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={leaveOpen}
        title="Cambios sin guardar"
        confirmLabel="Salir igual"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => {
          setLeaveOpen(false);
          router.push("/admin/catalogo");
        }}
      >
        <p>Si sales ahora se pierden los cambios de esta ficha.</p>
      </ConfirmDialog>
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
