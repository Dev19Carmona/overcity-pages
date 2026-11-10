"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import {
  BACKGROUND_TYPES,
  MAX_BACKGROUND_BYTES,
  MAX_MUSIC_BYTES,
  MUSIC_TYPES,
} from "@/lib/content-limits";
import type { MediaSetting } from "@/lib/content";
import { DEFAULT_BACKGROUND_URL, resolveMediaUrl } from "@/lib/media";

const KINDS = {
  background: {
    title: "Imagen de fondo",
    folder: "background",
    types: BACKGROUND_TYPES,
    maxBytes: MAX_BACKGROUND_BYTES,
    typeError: "La imagen debe ser PNG, JPG o WebP.",
    sizeError: "La imagen no puede superar 5 MB.",
    hint: "PNG, JPG o WebP · máximo 5 MB",
    noneText: "Sin imagen: fondo marino liso.",
    defaultText: "Paisaje por defecto.",
    customText: "Imagen propia.",
  },
  music: {
    title: "Música",
    folder: "music",
    types: MUSIC_TYPES,
    maxBytes: MAX_MUSIC_BYTES,
    typeError: "La música debe ser un archivo MP3.",
    sizeError: "La música no puede superar 15 MB.",
    hint: "MP3 · máximo 15 MB",
    noneText: "Sin música: el botón de música no se muestra.",
    defaultText: "Música por defecto.",
    customText: "Música propia.",
  },
} as const;

const actionButton =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-theme-red bg-theme-red/20 px-4 py-2 text-sm font-semibold transition hover:bg-theme-red/40 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-theme-red";

const plainButton =
  "rounded-full border border-border-soft px-4 py-2 text-sm font-semibold transition hover:border-theme-red disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

// Subir, cambiar, quitar y restaurar un archivo (fondo o música). La subida va directo
// del navegador a Vercel Blob; el valor solo cambia en el borrador hasta que se guarda.
export default function MediaUploader({
  kind,
  value,
  onChange,
  onBusyChange,
}: {
  kind: keyof typeof KINDS;
  value: MediaSetting;
  onChange: (next: MediaSetting) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const config = KINDS[kind];
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  async function handleFile(file: File) {
    setError(null);
    if (!(config.types as readonly string[]).includes(file.type)) {
      setError(config.typeError);
      return;
    }
    if (file.size > config.maxBytes) {
      setError(config.sizeError);
      return;
    }

    setProgress(0);
    onBusyChange?.(true);
    try {
      const blob = await upload(`${config.folder}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/media",
        contentType: file.type,
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      onChange({ source: "custom", url: blob.url });
    } catch (e) {
      // El valor anterior se conserva: nada cambia hasta guardar.
      setError(e instanceof Error && e.message ? e.message : "No se pudo subir el archivo.");
    } finally {
      setProgress(null);
      onBusyChange?.(false);
    }
  }

  const status =
    value.source === "none"
      ? config.noneText
      : value.source === "custom"
        ? config.customText
        : config.defaultText;
  const previewUrl =
    kind === "background" ? resolveMediaUrl(value, DEFAULT_BACKGROUND_URL) : null;

  return (
    <section
      aria-label={config.title}
      className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-white/30 bg-black/30 p-4 backdrop-blur-md"
    >
      <h3 className="text-sm font-semibold">{config.title}</h3>

      {kind === "background" && (
        <div
          aria-hidden="true"
          className="h-24 w-full rounded-xl border border-border-soft bg-theme-navy bg-cover bg-center"
          style={previewUrl ? { backgroundImage: `url(${JSON.stringify(previewUrl)})` } : undefined}
        />
      )}
      {kind === "music" && value.source === "custom" && value.url && (
        <audio src={value.url} controls preload="none" className="w-full" />
      )}

      <p className="text-xs">{status}</p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className={`${actionButton} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy
            ? `Subiendo… ${progress}%`
            : value.source === "custom"
              ? "Cambiar archivo"
              : "Subir archivo propio"}
          <input
            type="file"
            accept={config.types.join(",")}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFile(file);
            }}
            className="sr-only"
          />
        </label>
        {value.source !== "none" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              onChange({ source: "none", url: null });
            }}
            className={plainButton}
          >
            Quitar
          </button>
        )}
        {value.source !== "default" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              onChange({ source: "default", url: null });
            }}
            className={plainButton}
          >
            Restaurar
          </button>
        )}
      </div>

      {busy && (
        <div
          role="progressbar"
          aria-label={`Subiendo ${config.title.toLowerCase()}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 w-full overflow-hidden rounded-full bg-white/10"
        >
          <div className="h-full bg-theme-red transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-300">
          {error}
        </p>
      )}
      <p className="text-xs">{config.hint}</p>
    </section>
  );
}
