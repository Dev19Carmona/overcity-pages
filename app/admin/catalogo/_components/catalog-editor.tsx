"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import NightScene from "@/app/_components/night-scene";
import { logoutAction } from "@/app/admin/actions";
import { saveCatalog } from "@/app/admin/catalogo/actions";
import ProductImages from "@/app/admin/catalogo/_components/product-images";
import {
  CATALOG_CURRENCIES,
  type Catalog,
  type CatalogCurrency,
  type CatalogProduct,
} from "@/lib/catalog-shared";
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_PRODUCTS,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PRODUCT_NAME,
  MAX_TITLE,
  MAX_URL,
} from "@/lib/content-limits";

const inputBase =
  "w-full rounded-md border border-dashed border-white/40 bg-transparent px-2 py-1 outline-none focus-visible:border-theme-red";

const barButton =
  "rounded-full border border-border-soft px-4 py-2 text-sm font-semibold transition hover:border-theme-red disabled:opacity-50 disabled:hover:border-border-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

const smallButton =
  "rounded-full border border-border-soft px-3 py-1 text-xs font-semibold transition hover:border-theme-red disabled:opacity-40 disabled:hover:border-border-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

const card =
  "flex w-full flex-col gap-3 rounded-2xl border border-dashed border-white/30 bg-black/30 p-4 backdrop-blur-md";

const labelText = "text-xs font-semibold";

export default function CatalogEditor({ initial }: { initial: Catalog }) {
  const [saved, setSaved] = useState<Catalog>(initial);
  const [draft, setDraft] = useState<Catalog>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [uploads, setUploads] = useState(0); // subidas de imágenes en curso
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function save() {
    setMessage(null);
    startSaving(async () => {
      const result = await saveCatalog(draft);
      if (result.ok) {
        setSaved(result.catalog);
        setDraft(result.catalog);
        setMessage({ ok: true, text: "Cambios publicados." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function discard() {
    setDraft(saved);
    setMessage(null);
  }

  function trackUpload(busy: boolean) {
    setUploads((count) => count + (busy ? 1 : -1));
  }

  // ---------- categorías ----------
  function addCategory() {
    setDraft((current) => ({
      ...current,
      categories: [...current.categories, { id: crypto.randomUUID(), name: "Nueva categoría" }],
    }));
  }

  function renameCategory(id: string, name: string) {
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((c) => (c.id === id ? { ...c, name } : c)),
    }));
  }

  function removeCategory(id: string) {
    // Sus productos quedan "Sin categoría", no se borran.
    setDraft((current) => ({
      ...current,
      categories: current.categories.filter((c) => c.id !== id),
      products: current.products.map((p) =>
        p.categoryId === id ? { ...p, categoryId: null } : p,
      ),
    }));
  }

  function moveCategory(index: number, offset: -1 | 1) {
    setDraft((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.categories.length) return current;
      const categories = [...current.categories];
      [categories[index], categories[target]] = [categories[target], categories[index]];
      return { ...current, categories };
    });
  }

  // ---------- productos ----------
  function addProduct() {
    setDraft((current) => ({
      ...current,
      products: [
        ...current.products,
        {
          id: crypto.randomUUID(),
          name: "Nuevo producto",
          description: "",
          price: null,
          buyUrl: null,
          images: [],
          categoryId: null,
          visible: true,
        },
      ],
    }));
  }

  function setProduct(id: string, patch: Partial<CatalogProduct>) {
    setDraft((current) => ({
      ...current,
      products: current.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removeProduct(id: string) {
    setDraft((current) => ({
      ...current,
      products: current.products.filter((p) => p.id !== id),
    }));
  }

  function moveProduct(index: number, offset: -1 | 1) {
    setDraft((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.products.length) return current;
      const products = [...current.products];
      [products[index], products[target]] = [products[target], products[index]];
      return { ...current, products };
    });
  }

  return (
    <>
      <NightScene />
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-theme-navy/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/admin" className={barButton}>
            ← Panel
          </Link>
          <span className="text-sm font-semibold">Catálogo</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {message && (
            <span
              role="status"
              className={`text-sm font-semibold ${message.ok ? "text-green-300" : "text-red-300"}`}
            >
              {message.text}
            </span>
          )}
          <button
            type="button"
            disabled={!dirty || saving || uploads > 0}
            onClick={save}
            className={`${barButton} border-theme-red bg-theme-red/20`}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            disabled={!dirty || saving || uploads > 0}
            onClick={discard}
            className={barButton}
          >
            Descartar cambios
          </button>
          <form action={logoutAction}>
            <button type="submit" className={barButton}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pb-16 pt-8">
        <section aria-label="Datos del catálogo" className={card}>
          <label className="flex flex-col gap-1">
            <span className={labelText}>Título del catálogo</span>
            <input
              value={draft.title}
              maxLength={MAX_TITLE}
              onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))}
              className={`${inputBase} text-base font-semibold`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelText}>Moneda</span>
            <select
              value={draft.currency}
              onChange={(e) =>
                setDraft((c) => ({ ...c, currency: e.target.value as CatalogCurrency }))
              }
              className={`${inputBase} bg-theme-navy`}
            >
              {CATALOG_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section aria-label="Categorías" className="flex w-full flex-col gap-3">
          <h2 className="text-base font-semibold">
            Categorías ({draft.categories.length}/{MAX_CATEGORIES})
          </h2>
          <ul className="flex flex-col gap-3">
            {draft.categories.map((category, index) => (
              <li key={category.id} className={card}>
                <input
                  aria-label={`Nombre de la categoría ${index + 1}`}
                  value={category.name}
                  maxLength={MAX_CATEGORY_NAME}
                  onChange={(e) => renameCategory(category.id, e.target.value)}
                  className={inputBase}
                />
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    aria-label={`Mover categoría ${index + 1} hacia arriba`}
                    disabled={index === 0}
                    onClick={() => moveCategory(index, -1)}
                    className={smallButton}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover categoría ${index + 1} hacia abajo`}
                    disabled={index === draft.categories.length - 1}
                    onClick={() => moveCategory(index, 1)}
                    className={smallButton}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar categoría ${index + 1}`}
                    onClick={() => removeCategory(category.id)}
                    className={smallButton}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={draft.categories.length >= MAX_CATEGORIES}
            onClick={addCategory}
            className={barButton}
          >
            + Agregar categoría
          </button>
        </section>

        <section aria-label="Productos" className="flex w-full flex-col gap-3">
          <h2 className="text-base font-semibold">
            Productos ({draft.products.length}/{MAX_PRODUCTS})
          </h2>
          <ul className="flex flex-col gap-4">
            {draft.products.map((product, index) => (
              <li key={product.id} className={card}>
                <label className="flex flex-col gap-1">
                  <span className={labelText}>Nombre</span>
                  <input
                    value={product.name}
                    maxLength={MAX_PRODUCT_NAME}
                    onChange={(e) => setProduct(product.id, { name: e.target.value })}
                    className={`${inputBase} text-base font-semibold`}
                  />
                </label>

                <ProductImages
                  productName={product.name}
                  images={product.images}
                  onChange={(images) => setProduct(product.id, { images })}
                  onBusyChange={trackUpload}
                />

                <label className="flex flex-col gap-1">
                  <span className={labelText}>Descripción (opcional)</span>
                  <textarea
                    value={product.description}
                    maxLength={MAX_PRODUCT_DESCRIPTION}
                    rows={3}
                    onChange={(e) => setProduct(product.id, { description: e.target.value })}
                    className={`${inputBase} text-sm`}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={labelText}>Precio en {draft.currency} (opcional)</span>
                  <input
                    value={product.price === null ? "" : String(product.price)}
                    inputMode="numeric"
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                      setProduct(product.id, { price: digits ? Number(digits) : null });
                    }}
                    className={inputBase}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={labelText}>Link de compra (opcional)</span>
                  <input
                    value={product.buyUrl ?? ""}
                    maxLength={MAX_URL}
                    inputMode="url"
                    placeholder="https://"
                    onChange={(e) =>
                      setProduct(product.id, { buyUrl: e.target.value || null })
                    }
                    className={`${inputBase} text-xs`}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={labelText}>Categoría</span>
                  <select
                    value={product.categoryId ?? ""}
                    onChange={(e) =>
                      setProduct(product.id, { categoryId: e.target.value || null })
                    }
                    className={`${inputBase} bg-theme-navy`}
                  >
                    <option value="">Sin categoría</option>
                    {draft.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-theme-red">
                  <span>{product.visible ? "Visible" : "Oculto"}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={product.visible}
                    onChange={(e) => setProduct(product.id, { visible: e.target.checked })}
                    className="size-5 shrink-0 accent-theme-red"
                  />
                </label>

                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    aria-label={`Mover producto ${index + 1} hacia arriba`}
                    disabled={index === 0}
                    onClick={() => moveProduct(index, -1)}
                    className={smallButton}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover producto ${index + 1} hacia abajo`}
                    disabled={index === draft.products.length - 1}
                    onClick={() => moveProduct(index, 1)}
                    className={smallButton}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar producto ${index + 1}`}
                    onClick={() => removeProduct(product.id)}
                    className={smallButton}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={draft.products.length >= MAX_PRODUCTS}
            onClick={addProduct}
            className={barButton}
          >
            + Agregar producto
          </button>
        </section>
      </main>
    </>
  );
}
