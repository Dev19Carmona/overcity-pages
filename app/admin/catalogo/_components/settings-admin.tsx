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
  normalizeWhatsapp,
  type Catalog,
  type CatalogCurrency,
} from "@/lib/catalog-shared";
import { MAX_PRICE, MAX_TITLE } from "@/lib/content-limits";

export default function SettingsAdmin({ initial }: { initial: Catalog }) {
  const [saved, setSaved] = useState({
    title: initial.title,
    currency: initial.currency,
    whatsapp: initial.whatsapp,
    freeShippingFrom: initial.freeShippingFrom,
  });
  const [title, setTitle] = useState(initial.title);
  const [currency, setCurrency] = useState<CatalogCurrency>(initial.currency);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [freeFrom, setFreeFrom] = useState(
    initial.freeShippingFrom === null ? "" : String(initial.freeShippingFrom),
  );
  const [busy, startTransition] = useTransition();
  const { toast, show, hide } = useToast();

  const normalizedWhatsapp = normalizeWhatsapp(whatsapp);
  const freeTrimmed = freeFrom.trim();
  const freeValue = freeTrimmed === "" ? null : /^\d+$/.test(freeTrimmed) ? Number(freeTrimmed) : NaN;
  const freeInvalid =
    freeValue !== null && (!Number.isInteger(freeValue) || freeValue < 1 || freeValue > MAX_PRICE);
  const dirty =
    title.trim() !== saved.title ||
    currency !== saved.currency ||
    normalizedWhatsapp !== saved.whatsapp ||
    freeValue !== saved.freeShippingFrom;

  function save() {
    if (normalizedWhatsapp === null || freeInvalid) return;
    startTransition(async () => {
      const result = await saveCatalogSettings({
        title: title.trim(),
        currency,
        whatsapp: normalizedWhatsapp,
        freeShippingFrom: freeValue,
      });
      if (result.ok) {
        const c = result.catalog;
        setSaved({
          title: c.title,
          currency: c.currency,
          whatsapp: c.whatsapp,
          freeShippingFrom: c.freeShippingFrom,
        });
        setTitle(c.title);
        setCurrency(c.currency);
        setWhatsapp(c.whatsapp);
        setFreeFrom(c.freeShippingFrom === null ? "" : String(c.freeShippingFrom));
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
        <p className="text-[13px] text-white/70">Título, moneda, WhatsApp y envío gratis de todo el catálogo.</p>
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
        <label className={labelClass}>
          Número de WhatsApp
          <input
            type="tel"
            inputMode="tel"
            value={whatsapp}
            maxLength={30}
            placeholder="57 300 123 4567"
            aria-invalid={normalizedWhatsapp === null}
            onChange={(event) => setWhatsapp(event.target.value)}
            className={inputClass}
          />
          <span className={normalizedWhatsapp === null ? "font-medium text-[#ff5a63]" : "font-medium text-white/60"}>
            {normalizedWhatsapp === null
              ? "Debe tener entre 8 y 15 dígitos, con código de país."
              : "Con código de país, sin el +. Ahí llegan los pedidos de la bolsa. Vacío = sin pedidos por WhatsApp."}
          </span>
        </label>
        <label className={labelClass}>
          Envío gratis desde
          <input
            inputMode="numeric"
            value={freeFrom}
            maxLength={9}
            placeholder="Sin barra de envío gratis"
            aria-invalid={freeInvalid}
            onChange={(event) => setFreeFrom(event.target.value)}
            className={inputClass}
          />
          <span className={freeInvalid ? "font-medium text-[#ff5a63]" : "font-medium text-white/60"}>
            {freeInvalid
              ? `Debe ser un entero entre 1 y ${MAX_PRICE}.`
              : `Subtotal de la bolsa (en ${currency}) desde el que se anuncia envío gratis. Vacío = sin barra.`}
          </span>
        </label>
        <button type="submit" disabled={!dirty || busy || !title.trim() || normalizedWhatsapp === null || freeInvalid} className={`${primaryButton} self-start`}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </form>
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
