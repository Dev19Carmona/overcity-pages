"use client";

import { useState, useTransition } from "react";
import { saveColors, type CatalogActionResult } from "@/app/admin/catalogo/actions";
import {
  ConfirmDialog,
  focusRing,
  iconButton,
  inputClass,
  panel,
  primaryButton,
  Switch,
  Toast,
  useToast,
} from "@/app/admin/_components/ui";
import {
  COLOR_HEX_PATTERN,
  colorUsage,
  normalizeText,
  type Catalog,
  type CatalogColorDef,
} from "@/lib/catalog-shared";
import { MAX_COLORS, MAX_COLOR_NAME } from "@/lib/content-limits";

const DEFAULT_NEW_HEX = "#4B5320";

export default function ColorsAdmin({ initial }: { initial: Catalog }) {
  const [catalog, setCatalog] = useState(initial);
  const [newName, setNewName] = useState("");
  const [newHex, setNewHex] = useState(DEFAULT_NEW_HEX);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<CatalogColorDef | null>(null);
  const [busy, startTransition] = useTransition();
  const { toast, show, hide } = useToast();

  const colors = catalog.colors;
  const full = colors.length >= MAX_COLORS;

  function save(next: CatalogColorDef[], okMessage: string, onOk?: () => void) {
    startTransition(async () => {
      const result: CatalogActionResult = await saveColors(next);
      if (result.ok) {
        setCatalog(result.catalog);
        onOk?.();
        show(okMessage);
      } else {
        show(result.error);
      }
    });
  }

  function create() {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return show("Escribe un nombre para el color.");
    if (name.length > MAX_COLOR_NAME) return show(`Máximo ${MAX_COLOR_NAME} caracteres.`);
    if (colors.some((c) => normalizeText(c.name) === normalizeText(name))) {
      return show(`Ya existe «${name}».`);
    }
    if (!COLOR_HEX_PATTERN.test(newHex)) return show("El hex debe tener el formato #RRGGBB.");
    save([...colors, { name, hex: newHex, hidden: false }], `Color «${name}» creado`, () => {
      setNewName("");
      setNewHex(DEFAULT_NEW_HEX);
    });
  }

  function clearEdit(name: string) {
    setEdits((current) => {
      const { [name]: _removed, ...rest } = current;
      void _removed;
      return rest;
    });
  }

  function commitHex(color: CatalogColorDef) {
    const raw = edits[color.name];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (hex.toLowerCase() === color.hex.toLowerCase()) return clearEdit(color.name);
    if (!COLOR_HEX_PATTERN.test(hex)) {
      show("El hex debe tener el formato #RRGGBB.");
      return clearEdit(color.name);
    }
    save(
      colors.map((c) => (c.name === color.name ? { ...c, hex } : c)),
      `Color de «${color.name}» actualizado`,
      () => clearEdit(color.name),
    );
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= colors.length) return;
    const next = [...colors];
    [next[index], next[target]] = [next[target], next[index]];
    save(next, "Orden actualizado");
  }

  function setHidden(color: CatalogColorDef, hidden: boolean) {
    save(
      colors.map((c) => (c.name === color.name ? { ...c, hidden } : c)),
      hidden ? `«${color.name}» oculto` : `«${color.name}» visible`,
    );
  }

  return (
    <>
      <div>
        <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold tracking-wide">Colores</h1>
        <p className="text-[13px] text-white/70">
          {colors.length} de {MAX_COLORS} colores · los diseños eligen de esta lista
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
        className={`${panel} flex flex-wrap items-center gap-2 border-theme-red/45 p-3`}
      >
        <label className="flex-1 basis-48">
          <span className="sr-only">Nombre del nuevo color</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={full || busy}
            maxLength={MAX_COLOR_NAME}
            placeholder="Nuevo color, ej. Verde militar"
            className={`${inputClass} !h-[46px] !rounded-full !px-[18px]`}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="sr-only">Selector de color</span>
          <input
            type="color"
            value={COLOR_HEX_PATTERN.test(newHex) ? newHex.toLowerCase() : DEFAULT_NEW_HEX.toLowerCase()}
            onChange={(event) => setNewHex(event.target.value.toUpperCase())}
            disabled={full || busy}
            className={`size-[46px] shrink-0 cursor-pointer rounded-full border border-white/20 bg-transparent p-1 ${focusRing}`}
          />
        </label>
        <label className="w-28">
          <span className="sr-only">Hex del nuevo color</span>
          <input
            value={newHex}
            onChange={(event) => setNewHex(event.target.value)}
            disabled={full || busy}
            maxLength={7}
            placeholder="#RRGGBB"
            className={`${inputClass} !h-[46px] !rounded-full !px-[16px]`}
          />
        </label>
        <button type="submit" disabled={full || busy} className={`${primaryButton} !h-[46px]`}>
          <span aria-hidden="true">+</span> Crear color
        </button>
      </form>

      <div className={`${panel} overflow-hidden`}>
        {colors.length === 0 && (
          <p className="px-4 py-7 text-sm text-white/70">Aún no hay colores. Crea el primero arriba.</p>
        )}
        <ul>
          {colors.map((color, index) => {
            const usage = colorUsage(catalog, color.name);
            const inUse = usage.designs > 0;
            const hexValue = edits[color.name] ?? color.hex;
            return (
              <li
                key={color.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-white/[0.07] px-3.5 py-2.5 last:border-b-0 hover:bg-white/[0.04]"
              >
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={`Subir ${color.name}`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    className={`h-5 w-7 text-sm leading-none text-white disabled:opacity-35 ${focusRing}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${color.name}`}
                    disabled={busy || index === colors.length - 1}
                    onClick={() => move(index, 1)}
                    className={`h-5 w-7 text-sm leading-none text-white disabled:opacity-35 ${focusRing}`}
                  >
                    ↓
                  </button>
                </span>
                <input
                  type="color"
                  aria-label={`Elegir color de ${color.name}`}
                  value={(COLOR_HEX_PATTERN.test(hexValue) ? hexValue : color.hex).toLowerCase()}
                  disabled={busy}
                  onChange={(event) =>
                    setEdits((current) => ({ ...current, [color.name]: event.target.value }))
                  }
                  onBlur={() => commitHex(color)}
                  className={`size-9 shrink-0 cursor-pointer rounded-full border border-white/20 bg-transparent p-0.5 ${focusRing}`}
                />
                <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                  <span className="break-words text-[15px] font-bold">
                    {color.name}
                    {color.hidden && (
                      <span className="ml-2 rounded-full border border-white/25 px-2 py-px text-[11px] font-semibold text-white/75">
                        Oculto
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-white/65">
                    {inUse
                      ? `En ${usage.designs} ${usage.designs === 1 ? "diseño" : "diseños"} · ${usage.products} ${usage.products === 1 ? "producto" : "productos"}`
                      : "Sin uso"}
                  </span>
                </div>
                <input
                  aria-label={`Hex de ${color.name}`}
                  value={hexValue}
                  maxLength={7}
                  disabled={busy}
                  onChange={(event) =>
                    setEdits((current) => ({ ...current, [color.name]: event.target.value }))
                  }
                  onBlur={() => commitHex(color)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") clearEdit(color.name);
                  }}
                  className={`${inputClass} !h-9 !w-24 !text-[13px]`}
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-white/85">
                  <Switch
                    checked={color.hidden}
                    label={`Oculto: ${color.name}`}
                    disabled={busy}
                    onChange={(next) => setHidden(color, next)}
                  />
                  Oculto
                </label>
                <button
                  type="button"
                  aria-label={`Eliminar color ${color.name}`}
                  title={inUse ? "En uso: ocúltalo en lugar de eliminarlo" : undefined}
                  disabled={busy || inUse}
                  onClick={() => setPending(color)}
                  className={`${iconButton} hover:!border-theme-red hover:bg-theme-red`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
                {inUse && (
                  <p className="basis-full text-xs text-white/60">
                    No se puede eliminar mientras esté en uso. Puedes ocultarlo.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xs text-white/60">
        El nombre no se puede cambiar: es el identificador que usan los diseños, el stock y la
        bolsa. Un color oculto no se ofrece a otros diseños, pero los que ya lo tienen lo conservan.
      </p>

      <ConfirmDialog
        open={pending !== null}
        title="Eliminar color"
        confirmLabel="Eliminar"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          const color = pending;
          setPending(null);
          save(
            colors.filter((c) => c.name !== color.name),
            `«${color.name}» eliminado`,
          );
        }}
      >
        <p>Se eliminará «{pending?.name}» de la lista de colores. Ningún diseño lo usa.</p>
      </ConfirmDialog>

      <Toast toast={toast} onClose={hide} />
    </>
  );
}
