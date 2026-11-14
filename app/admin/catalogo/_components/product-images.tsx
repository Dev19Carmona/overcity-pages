"use client";

import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { useState } from "react";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/content-limits";

const smallButton =
  "rounded-full border border-border-soft px-3 py-1 text-xs font-semibold transition hover:border-theme-red disabled:opacity-40 disabled:hover:border-border-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

// Subir, quitar y reordenar las imágenes de un producto (la primera es la portada).
// La subida va directo del navegador a Vercel Blob; solo cambia el borrador hasta guardar.
export default function ProductImages({
  productName,
  images,
  onChange,
  onBusyChange,
}: {
  productName: string;
  images: string[];
  onChange: (next: string[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;
  const full = images.length >= MAX_PRODUCT_IMAGES;

  async function handleFiles(files: File[]) {
    setError(null);
    const free = MAX_PRODUCT_IMAGES - images.length;
    if (files.length > free) {
      setError(`Solo caben ${MAX_PRODUCT_IMAGES} imágenes por producto.`);
      return;
    }
    for (const file of files) {
      if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
        setError("Las imágenes deben ser PNG, JPG o WebP.");
        return;
      }
      if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
        setError("Cada imagen no puede superar 2 MB.");
        return;
      }
    }

    setProgress(0);
    onBusyChange(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const blob = await upload(`catalog/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/media",
          contentType: file.type,
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        });
        uploaded.push(blob.url);
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo subir la imagen.");
    } finally {
      if (uploaded.length > 0) onChange([...images, ...uploaded]);
      setProgress(null);
      onBusyChange(false);
    }
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <ul className="grid grid-cols-2 gap-2">
        {images.map((url, index) => (
          <li
            key={url}
            className="flex flex-col items-center gap-1 rounded-xl border border-border-soft bg-black/30 p-2"
          >
            <Image
              src={url}
              alt={`${productName || "Producto"}, imagen ${index + 1}`}
              width={160}
              height={160}
              unoptimized
              className="aspect-square w-full rounded-lg object-cover"
            />
            <p className="text-xs">{index === 0 ? "Portada" : `Imagen ${index + 1}`}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Mover imagen ${index + 1} a la izquierda`}
                disabled={index === 0 || busy}
                onClick={() => move(index, -1)}
                className={smallButton}
              >
                ←
              </button>
              <button
                type="button"
                aria-label={`Mover imagen ${index + 1} a la derecha`}
                disabled={index === images.length - 1 || busy}
                onClick={() => move(index, 1)}
                className={smallButton}
              >
                →
              </button>
              <button
                type="button"
                aria-label={`Quitar imagen ${index + 1}`}
                disabled={busy}
                onClick={() => onChange(images.filter((_, i) => i !== index))}
                className={smallButton}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <label
        className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-theme-red bg-theme-red/20 px-4 py-2 text-sm font-semibold transition hover:bg-theme-red/40 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-theme-red ${
          busy || full ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {busy ? `Subiendo… ${progress}%` : "Agregar imágenes"}
        <input
          type="file"
          multiple
          accept={PRODUCT_IMAGE_TYPES.join(",")}
          disabled={busy || full}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void handleFiles(files);
          }}
          className="sr-only"
        />
      </label>
      {busy && (
        <div
          role="progressbar"
          aria-label="Subiendo imagen"
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
      <p className="text-xs">
        PNG, JPG o WebP · máximo 2 MB · {images.length}/{MAX_PRODUCT_IMAGES} imágenes
      </p>
    </div>
  );
}
