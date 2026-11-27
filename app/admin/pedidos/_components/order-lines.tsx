"use client";

import { focusRing, inputClass, labelClass, Thumb } from "@/app/admin/_components/ui";
import { fitCombo, HiddenTag } from "@/app/admin/pedidos/_components/line-picker";
import NumberInput from "@/app/admin/pedidos/_components/money-input";
import { formatPrice, type CatalogCurrency } from "@/lib/catalog-shared";
import { MAX_PRICE, MAX_STOCK } from "@/lib/content-limits";
import {
  comboKey,
  type LineCombo,
  type OrderLine,
  type PickerProduct,
  type StockMap,
} from "@/lib/orders-shared";

type Option = { value: string; label: string };

// Un select que conserva el valor guardado aunque ya no exista en el catálogo.
function ComboSelect({
  label,
  ariaLabel,
  value,
  fallbackLabel,
  options,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  fallbackLabel: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const known = options.some((option) => option.value === value);
  return (
    <label className={labelClass}>
      {label}
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} !h-10 !px-2`}
      >
        {!known && (
          <option value={value} className="bg-theme-navy">
            {fallbackLabel} (ya no existe)
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-theme-navy">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function OrderLines({
  lines,
  products,
  stock,
  currency,
  editable,
  onChange,
}: {
  lines: OrderLine[];
  products: Record<string, PickerProduct>;
  stock: StockMap;
  currency: CatalogCurrency;
  editable: boolean;
  onChange: (index: number, next: OrderLine | null) => void;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-white/70">El pedido no tiene líneas todavía.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line, index) => {
        const product = products[line.productId];
        const units = stock[comboKey(line)];
        const design = product?.designs.find((item) => item.id === line.designId);
        const total = line.unitPrice === null ? null : line.unitPrice * line.qty;

        // Cambiar diseño, color o talla crea otra combinación: toma las copias del catálogo.
        const change = (combo: Partial<LineCombo>) => {
          const next = product?.designs.find((item) => item.id === (combo.designId ?? line.designId));
          if (!product || !next) return;
          onChange(index, {
            ...line,
            designId: next.id,
            ...fitCombo(next, combo.color ?? line.color, combo.size ?? line.size),
            productName: product.name,
            designName: next.name,
            image: next.image,
          });
        };

        return (
          <li
            key={comboKey(line)}
            className="flex flex-col gap-2.5 rounded-xl border border-white/15 bg-black/25 p-3"
          >
            <div className="flex items-start gap-3">
              <Thumb image={line.image} alt="" size={56} className="h-[70px] w-14 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <strong className="break-words text-sm">{line.productName}</strong>
                <span className="break-words text-xs text-white/70">
                  {line.designName} · {line.color} · {line.size}
                  {!editable && ` · × ${line.qty}`}
                </span>
                {editable && (
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    {product && !product.visible && <HiddenTag />}
                    {units ? (
                      <>
                        <span className="text-white/65">
                          Físico {units.physical} · Disponible {units.available}
                        </span>
                        {line.qty > units.available && (
                          <strong className="text-[#ff5a63]">Disponible: {units.available}</strong>
                        )}
                      </>
                    ) : (
                      <strong className="text-[#ff5a63]">Ya no existe en el catálogo</strong>
                    )}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-sm font-bold">
                  {total === null ? "Sin precio" : formatPrice(total, currency)}
                </span>
                {editable && (
                  <button
                    type="button"
                    aria-label={`Quitar ${line.productName}, ${line.color}, ${line.size}`}
                    onClick={() => onChange(index, null)}
                    className={`rounded py-1 text-xs font-semibold text-[#ff5a63] ${focusRing}`}
                  >
                    Quitar
                  </button>
                )}
                {!editable && line.unitPrice !== null && (
                  <span className="text-xs text-white/65">
                    {formatPrice(line.unitPrice, currency)} c/u
                  </span>
                )}
              </div>
            </div>
            {editable && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <ComboSelect
                  label="Diseño"
                  ariaLabel={`Diseño de ${line.productName}`}
                  value={line.designId}
                  fallbackLabel={line.designName}
                  options={(product?.designs ?? []).map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                  onChange={(designId) => change({ designId })}
                />
                <ComboSelect
                  label="Color"
                  ariaLabel={`Color de ${line.productName}`}
                  value={line.color}
                  fallbackLabel={line.color}
                  options={(design?.colors ?? []).map((color) => ({ value: color, label: color }))}
                  onChange={(color) => change({ color })}
                />
                <ComboSelect
                  label="Talla"
                  ariaLabel={`Talla de ${line.productName}`}
                  value={line.size}
                  fallbackLabel={line.size}
                  options={Object.keys(design?.stock[line.color] ?? {}).map((size) => ({
                    value: size,
                    label: size,
                  }))}
                  onChange={(size) => change({ size })}
                />
                <label className={labelClass}>
                  Cantidad
                  <NumberInput
                    label={`Cantidad de ${line.productName}`}
                    value={line.qty === 0 ? null : line.qty}
                    max={MAX_STOCK}
                    onChange={(qty) => onChange(index, { ...line, qty: qty ?? 0 })}
                  />
                </label>
                <label className={`${labelClass} col-span-2 sm:col-span-1`}>
                  Precio c/u
                  <NumberInput
                    label={`Precio de ${line.productName}`}
                    value={line.unitPrice}
                    max={MAX_PRICE}
                    placeholder="Sin precio"
                    onChange={(unitPrice) => onChange(index, { ...line, unitPrice })}
                  />
                </label>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
