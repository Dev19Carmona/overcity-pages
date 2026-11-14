"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  saveCategories,
  saveProduct,
} from "@/app/admin/catalogo/actions";
import ProductImages from "@/app/admin/catalogo/_components/product-images";
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
  CATALOG_COLOR_HEX,
  CATALOG_COLORS,
  emptyStock,
  formatPrice,
  ONE_SIZE,
  sizesFor,
  stockTotal,
  type Catalog,
  type CatalogCategory,
  type CatalogColor,
  type CatalogImage,
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

const NEW_CATEGORY = "__new";

// Ajusta el stock a las tallas de la categoría nueva: "Única" suma todo; de ahí a varias tallas
// empieza en 0; si las tallas son las mismas no cambia nada.
function remapStock(product: CatalogProduct, sizes: string[]): Record<string, number> {
  const same =
    Object.keys(product.stock).length === sizes.length &&
    sizes.every((size) => size in product.stock);
  if (same) return product.stock;
  if (sizes.length === 1 && sizes[0] === ONE_SIZE) return { [ONE_SIZE]: stockTotal(product) };
  return emptyStock(sizes);
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
    colors: ["Negro"],
    stock: emptyStock(sizesFor(first)),
    images: [],
  };
}

export default function ProductEditor({
  catalog,
  product,
}: {
  catalog: Catalog;
  product: CatalogProduct | null; // null = producto nuevo
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(catalog.categories);
  const [saved, setSaved] = useState<CatalogProduct | null>(product);
  const [draft, setDraft] = useState<CatalogProduct>(() => product ?? blankProduct(catalog.categories));
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
      stock: remapStock(current, sizesFor(next)),
    }));
  }

  function toggleColor(color: CatalogColor) {
    if (draft.colors.includes(color)) {
      if (draft.colors.length === 1) return show("El producto necesita al menos un color.");
      const rest = draft.colors.filter((c) => c !== color);
      const moved = draft.images.filter((image) => image.color === color).length;
      setDraft((current) => ({
        ...current,
        colors: rest,
        images: current.images.map((image) =>
          image.color === color ? { ...image, color: rest[0] } : image,
        ),
      }));
      if (moved) show(`${moved} ${moved === 1 ? "foto pasó" : "fotos pasaron"} a ${rest[0]}.`);
    } else {
      patch({ colors: CATALOG_COLORS.filter((c) => c === color || draft.colors.includes(c)) });
    }
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
        setCategories(result.catalog.categories);
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
      stock: remapStock(current, sizesFor(next)),
    }));
  }

  function save() {
    if (!draft.name.trim()) return show("Ponle un nombre al producto.");
    if (draft.images.length === 0) return show("Sube al menos una foto.");
    startSaving(async () => {
      const result = await saveProduct({ ...draft, name: draft.name.trim() });
      if (result.ok) {
        const stored = result.catalog.products.find((p) => p.id === draft.id) ?? draft;
        setSaved(stored);
        setDraft(stored);
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
    ? "Subiendo fotos…"
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

      <ProductImages
        productName={draft.name}
        images={draft.images}
        colors={draft.colors}
        onChange={(update) =>
          setDraft((current) => ({ ...current, images: update(current.images) }))
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
          <h2 className="text-[17px] font-bold">Colores</h2>
          <div className="flex flex-wrap gap-2">
            {CATALOG_COLORS.map((color) => {
              const on = draft.colors.includes(color);
              const count = draft.images.filter((image: CatalogImage) => image.color === color).length;
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleColor(color)}
                  className={`flex items-center gap-2 rounded-full border py-[5px] pl-[5px] pr-3 text-[13px] font-semibold text-white ${focusRing} ${
                    on ? "border-theme-red bg-theme-red/20" : "border-white/15 bg-black/30"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="size-[22px] rounded-full border border-white/40"
                    style={{ background: CATALOG_COLOR_HEX[color] }}
                  />
                  {color}
                  {on && <span className="text-[11px] opacity-60">{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
            <h2 className="text-[17px] font-bold">Stock por talla</h2>
            <span className="text-[13px] text-white/70">{stockTotal(draft)} unidades</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
            {sizes.map((size) => {
              const units = draft.stock[size] ?? 0;
              return (
                <label
                  key={size}
                  className={`flex flex-col gap-0.5 rounded-xl border bg-black/35 px-2.5 py-2 ${
                    units === 0 ? "border-theme-red/50" : "border-white/15"
                  }`}
                >
                  <span className="text-[11px] font-bold text-white/70">{size}</span>
                  <input
                    aria-label={`Stock talla ${size}`}
                    value={String(units)}
                    inputMode="numeric"
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      const value = Math.min(digits ? parseInt(digits, 10) : 0, MAX_STOCK);
                      patch({ stock: { ...draft.stock, [size]: value } });
                    }}
                    className={`w-full min-w-0 border-0 bg-transparent p-0 text-xl font-extrabold outline-none ${focusRing} ${
                      units === 0 ? "text-[#ff5a63]" : "text-white"
                    }`}
                  />
                </label>
              );
            })}
          </div>
          <p className="text-xs text-white/65">Las tallas en 0 aparecen tachadas en la tienda.</p>
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
