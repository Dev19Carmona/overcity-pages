"use client";

import { useState, useTransition } from "react";
import { saveCatalogSettings } from "@/app/admin/catalogo/actions";
import {
  inputClass,
  labelClass,
  panel,
  primaryButton,
  Toast,
  useToast,
} from "@/app/admin/_components/ui";
import {
  CATALOG_CURRENCIES,
  formatPrice,
  type Catalog,
  type CatalogCurrency,
} from "@/lib/catalog-shared";
import { MAX_TITLE } from "@/lib/content-limits";

export default function SettingsAdmin({ initial }: { initial: Catalog }) {
  const [saved, setSaved] = useState({ title: initial.title, currency: initial.currency });
  const [title, setTitle] = useState(initial.title);
  const [currency, setCurrency] = useState<CatalogCurrency>(initial.currency);
  const [busy, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const dirty = title.trim() !== saved.title || currency !== saved.currency;

  function save() {
    startTransition(async () => {
      const result = await saveCatalogSettings({ title: title.trim(), currency });
      if (result.ok) {
        setSaved({ title: result.catalog.title, currency: result.catalog.currency });
        setTitle(result.catalog.title);
        setCurrency(result.catalog.currency);
        show("Ajustes guardados");
      } else {
        show(result.error);
      }
    });
  }

  return (
    <>
      <div>
        <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold tracking-wide">Ajustes</h1>
        <p className="text-[13px] text-white/70">Título y moneda de todo el catálogo.</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className={`${panel} flex max-w-xl flex-col gap-4 p-4`}
      >
        <label className={labelClass}>
          Título del catálogo
          <input
            value={title}
            maxLength={MAX_TITLE}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
          <span className="font-medium text-white/60">
            Es el título de /catalogo y el texto del botón de la página principal.
          </span>
        </label>
        <label className={labelClass}>
          Moneda
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as CatalogCurrency)}
            className={inputClass}
          >
            {CATALOG_CURRENCIES.map((code) => (
              <option key={code} value={code} className="bg-theme-navy">
                {code}
              </option>
            ))}
          </select>
          <span className="font-medium text-white/60">
            Ejemplo: {formatPrice(85000, currency)}
          </span>
        </label>
        <button type="submit" disabled={!dirty || busy || !title.trim()} className={`${primaryButton} self-start`}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </form>
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
