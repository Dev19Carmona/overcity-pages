"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CATALOG_COLOR_HEX, type CatalogImage } from "@/lib/catalog-shared";

// Estilos y piezas compartidas por las pantallas del panel de catálogo (SPEC 07).
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

export const panel =
  "rounded-2xl border border-border-soft bg-black/40 backdrop-blur-md";

export const primaryButton = `inline-flex items-center justify-center gap-2 rounded-full border border-theme-red bg-theme-red px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_18px_rgba(216,26,33,0.45)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-none ${focusRing}`;

export const softButton = `inline-flex items-center justify-center gap-2 rounded-full border border-theme-red bg-theme-red/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-theme-red/40 disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`;

export const ghostButton = `inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-theme-red disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-white/20 ${focusRing}`;

export const iconButton = `inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-white transition hover:border-theme-red disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/20 ${focusRing}`;

export const inputClass = `h-11 w-full min-w-0 rounded-xl border border-white/15 bg-black/35 px-3.5 text-[15px] text-white outline-none placeholder:text-white/50 focus-visible:border-theme-red ${focusRing}`;

export const labelClass = "flex flex-col gap-1.5 text-xs font-semibold text-white/80";

export function chipClass(active: boolean) {
  return `shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold text-white transition hover:border-theme-red ${focusRing} ${
    active ? "border-theme-red bg-theme-red/25" : "border-white/15 bg-black/35"
  }`;
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-6 w-[42px] shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${focusRing} ${
        checked ? "bg-theme-red" : "bg-white/25"
      }`}
    >
      <span
        className={`size-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// Miniatura de producto: la foto, o un degradado del color si no hay.
export function Thumb({
  image,
  alt,
  className,
  size = 80,
}: {
  image: CatalogImage | undefined;
  alt: string;
  className?: string;
  size?: number;
}) {
  if (!image) {
    return <span aria-hidden="true" className={`block bg-white/5 ${className ?? ""}`} />;
  }
  return (
    <span
      className={`relative block overflow-hidden ${className ?? ""}`}
      style={{
        background: `linear-gradient(160deg, ${CATALOG_COLOR_HEX[image.color]} 0%, #0a1c29 100%)`,
      }}
    >
      <Image
        src={image.url}
        alt={alt}
        width={size}
        height={Math.round(size * 1.25)}
        unoptimized
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  );
}

export type ToastState = { message: string; action?: { label: string; run: () => void } } | null;

// Aviso temporal abajo al centro (role="status"), con acción opcional como "Deshacer".
export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, action?: { label: string; run: () => void }) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const hide = useCallback(() => setToast(null), []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { toast, show, hide };
}

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-[80] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-4 rounded-full border border-theme-red/55 bg-theme-navy/95 px-5 py-3 shadow-[0_0_20px_rgba(255,35,62,0.3)]"
    >
      <span className="text-sm">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onClose();
          }}
          className={`whitespace-nowrap text-sm font-extrabold text-[#ff5a63] ${focusRing}`}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

// Diálogo de confirmación con <dialog> (estilo de modales de la SPEC 04).
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-sm rounded-2xl border border-theme-red/50 bg-theme-navy p-6 text-white shadow-[0_0_30px_rgba(216,26,33,0.25)] backdrop:bg-[rgba(10,28,41,0.85)] backdrop:backdrop-blur-[4px]"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-sm text-white/85">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={ghostButton}>
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} className={primaryButton}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
