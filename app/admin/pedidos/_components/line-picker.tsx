"use client";

import { useState, useTransition } from "react";
import {
  chipClass,
  focusRing,
  ghostButton,
  inputClass,
  labelClass,
  softButton,
  Thumb,
} from "@/app/admin/_components/ui";
import NumberInput from "@/app/admin/pedidos/_components/money-input";
import { getPickerProduct } from "@/app/admin/pedidos/actions";
import { normalizeText } from "@/lib/catalog-shared";
import { MAX_STOCK } from "@/lib/content-limits";
import { comboKey, type OrderLine, type PickerData, type PickerProduct } from "@/lib/orders-shared";

export type CatalogOption = { id: string; name: string; visible: boolean; cover: string };

const MAX_RESULTS = 8;

export function HiddenTag() {
  return (
    <span className="shrink-0 rounded-full border border-white/25 px-2 py-0.5 text-[11px] font-semibold text-white/75">
      Oculto
    </span>
  );
}

// Primera combinación válida de un diseño, conservando el color y la talla si existen en él.
export function fitCombo(
  design: PickerProduct["designs"][number],
  color: string,
  size: string,
): { color: string; size: string } {
  const nextColor = design.colors.includes(color) ? color : (design.colors[0] ?? "");
  const sizes = Object.keys(design.stock[nextColor] ?? {});
  return { color: nextColor, size: sizes.includes(size) ? size : (sizes[0] ?? "") };
}

// Selector de líneas: producto (incluidos los ocultos) → diseño → color → talla.
export default function LinePicker({
  options,
  orderId,
  onAdd,
}: {
  options: CatalogOption[];
  orderId: string | null; // null = pedido nuevo
  onAdd: (line: OrderLine, data: PickerData) => void;
}) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PickerData | null>(null);
  const [choice, setChoice] = useState({ designId: "", color: "", size: "" });
  const [qty, setQty] = useState<number | null>(1);
  const [error, setError] = useState("");
  const [loading, startLoading] = useTransition();

  const needle = normalizeText(query.trim());
  const results = needle
    ? options.filter((option) => normalizeText(option.name).includes(needle))
    : [];

  function choose(id: string) {
    setError("");
    startLoading(async () => {
      const result = await getPickerProduct(id, orderId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const design = result.data.product.designs[0];
      if (!design) {
        setError("Ese producto no tiene diseños.");
        return;
      }
      setData(result.data);
      setChoice({ designId: design.id, ...fitCombo(design, "", "") });
      setQty(1);
      setQuery("");
    });
  }

  const product = data?.product;
  const design = product?.designs.find((item) => item.id === choice.designId);
  const sizes = Object.keys(design?.stock[choice.color] ?? {});
  const units =
    product && data
      ? data.stock[comboKey({ productId: product.id, ...choice })]
      : undefined;

  function add() {
    if (!data || !product || !design || !choice.size || !qty) return;
    onAdd(
      {
        productId: product.id,
        designId: design.id,
        color: choice.color,
        size: choice.size,
        qty,
        unitPrice: product.price,
        productName: product.name,
        designName: design.name,
        image: design.image,
      },
      data,
    );
    setData(null);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-black/25 p-3">
      <label className={labelClass}>
        Agregar producto
        <input
          type="search"
          value={query}
          placeholder="Buscar producto"
          onChange={(event) => setQuery(event.target.value)}
          className={`${inputClass} !h-10`}
        />
      </label>
      {needle && results.length === 0 && (
        <p className="text-[13px] text-white/70">Ningún producto coincide.</p>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.slice(0, MAX_RESULTS).map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={loading}
                onClick={() => choose(option.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl border border-white/10 px-2.5 py-1.5 text-left text-sm font-semibold transition hover:border-theme-red disabled:opacity-50 ${focusRing}`}
              >
                <Thumb image={option.cover} alt="" size={32} className="h-10 w-8 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {!option.visible && <HiddenTag />}
              </button>
            </li>
          ))}
          {results.length > MAX_RESULTS && (
            <li className="text-xs text-white/60">
              Hay {results.length - MAX_RESULTS} más: escribe para afinar la búsqueda.
            </li>
          )}
        </ul>
      )}
      {loading && (
        <p role="status" className="text-[13px] text-white/70">
          Cargando producto…
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-[#ff5a63]">
          {error}
        </p>
      )}

      {data && product && design && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          <div className="flex items-center gap-2">
            <strong className="min-w-0 flex-1 truncate text-sm">{product.name}</strong>
            {!product.visible && <HiddenTag />}
          </div>
          <div role="group" aria-label="Diseño" className="flex gap-2 overflow-x-auto p-1">
            {product.designs.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === design.id}
                onClick={() =>
                  setChoice({ designId: item.id, ...fitCombo(item, choice.color, choice.size) })
                }
                className={`flex shrink-0 items-center gap-2 !py-1 !pl-1 ${chipClass(item.id === design.id)}`}
              >
                <Thumb image={item.image} alt="" size={28} className="h-9 w-7 rounded-full" />
                {item.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className={labelClass}>
              Color
              <select
                value={choice.color}
                onChange={(event) =>
                  setChoice({
                    designId: design.id,
                    ...fitCombo(design, event.target.value, choice.size),
                  })
                }
                className={`${inputClass} !h-10`}
              >
                {design.colors.map((color) => (
                  <option key={color} value={color} className="bg-theme-navy">
                    {color}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Talla
              <select
                value={choice.size}
                onChange={(event) => setChoice({ ...choice, size: event.target.value })}
                className={`${inputClass} !h-10`}
              >
                {sizes.map((size) => (
                  <option key={size} value={size} className="bg-theme-navy">
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Cantidad
              <NumberInput label="Cantidad a agregar" value={qty} max={MAX_STOCK} onChange={setQty} />
            </label>
          </div>
          <p className="text-[13px] text-white/75">
            Físico: <strong>{units?.physical ?? 0}</strong> · Disponible:{" "}
            <strong>{units?.available ?? 0}</strong>
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setData(null)} className={ghostButton}>
              Cerrar
            </button>
            <button type="button" onClick={add} disabled={!qty || !choice.size} className={softButton}>
              Agregar al pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
