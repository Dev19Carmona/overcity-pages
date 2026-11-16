"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  focusRing,
  iconButton,
  inputClass,
  panel,
  softButton,
} from "@/app/admin/_components/ui";
import {
  colorHex,
  normalizeText,
  resizeStock,
  type CatalogColor,
  type CatalogColorDef,
  type CatalogDesign,
} from "@/lib/catalog-shared";
import {
  MAX_DESIGN_COLORS,
  MAX_DESIGN_NAME,
  MAX_DESIGNS,
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/content-limits";

type Uploading = { id: string; name: string; preview: string; pct: number };

type Updater = (previous: CatalogDesign[]) => CatalogDesign[];

const MAX_IMAGE_MB = MAX_PRODUCT_IMAGE_BYTES / 1048576;

// Sube una foto a Supabase Storage con la URL firmada que entrega /api/catalog-media (SPEC 12) y
// devuelve su URL pública. El bucket impone el tamaño y los tipos; aquí se muestra el motivo.
async function uploadPhoto(file: File, onProgress: (percent: number) => void): Promise<string> {
  const response = await fetch("/api/catalog-media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  const target = (await response.json().catch(() => null)) as {
    signedUrl?: string;
    publicUrl?: string;
    error?: string;
  } | null;
  if (!response.ok || !target?.signedUrl || !target.publicUrl) {
    throw new Error(target?.error ?? "No se pudo preparar la subida.");
  }
  const { signedUrl, publicUrl } = target;
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      if (request.status === 413 || /exceeded the maximum/i.test(request.responseText)) {
        return reject(new Error(`pesa más de ${MAX_IMAGE_MB} MB.`));
      }
      if (request.status === 415 || /mime type/i.test(request.responseText)) {
        return reject(new Error("solo PNG, JPG o WebP."));
      }
      reject(new Error("No se pudo subir la imagen."));
    };
    request.onerror = () => reject(new Error("No se pudo subir la imagen."));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    request.send(body);
  });
  return publicUrl;
}

// Primer "Diseño N" que no esté en uso (sin distinguir mayúsculas ni tildes).
function freeName(used: string[]): string {
  const taken = new Set(used.map(normalizeText));
  let n = used.length + 1;
  while (taken.has(normalizeText(`Diseño ${n}`))) n += 1;
  return `Diseño ${n}`;
}

// Diseños de un producto (SPEC 10): hasta MAX_DESIGNS, el primero es la portada. Cada uno tiene una foto,
// un nombre, sus colores y su stock. La subida va directo del navegador a Supabase Storage con una URL
// firmada (SPEC 12); solo cambia el borrador hasta guardar.
export default function ProductDesigns({
  designs,
  palette,
  sizes,
  onChange,
  onBusyChange,
  notify,
}: {
  designs: CatalogDesign[];
  palette: CatalogColorDef[]; // colores del catálogo, en orden (SPEC 11)
  sizes: string[];
  onChange: (update: Updater) => void;
  onBusyChange: (busy: boolean) => void;
  notify: (message: string, action?: { label: string; run: () => void }) => void;
}) {
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileOver, setFileOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sizesRef = useRef(sizes);
  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  const total = designs.length + uploading.length;
  const full = total >= MAX_DESIGNS;

  useEffect(() => {
    onBusyChange(uploading.length > 0);
  }, [uploading.length, onBusyChange]);

  // Color inicial de un diseño nuevo: el primero visible de la lista.
  const defaultColor = palette.find((c) => !c.hidden)?.name ?? null;

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    if (defaultColor === null) {
      setErrors(["No hay colores visibles. Crea o muestra uno en Catálogo → Colores."]);
      return;
    }
    const problems: string[] = [];
    let room = MAX_DESIGNS - total;
    const accepted: File[] = [];
    for (const file of files) {
      if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
        problems.push(`${file.name}: solo PNG, JPG o WebP.`);
      } else if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
        problems.push(`${file.name}: pesa ${(file.size / 1048576).toFixed(1)} MB (máximo ${MAX_IMAGE_MB} MB).`);
      } else if (room <= 0) {
        problems.push(`${file.name}: ya llegaste a ${MAX_DESIGNS} diseños.`);
      } else {
        room -= 1;
        accepted.push(file);
      }
    }
    setErrors(problems);

    const items: Uploading[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      preview: URL.createObjectURL(file),
      pct: 0,
    }));
    if (items.length === 0) return;
    setUploading((current) => [...current, ...items]);

    await Promise.all(
      accepted.map(async (file, index) => {
        const item = items[index];
        try {
          const url = await uploadPhoto(file, (pct) =>
            setUploading((current) => current.map((u) => (u.id === item.id ? { ...u, pct } : u))),
          );
          onChange((previous) =>
            previous.length >= MAX_DESIGNS
              ? previous
              : [
                  ...previous,
                  {
                    id: crypto.randomUUID(),
                    name: freeName(previous.map((d) => d.name)),
                    image: url,
                    colors: [defaultColor],
                    stock: resizeStock({}, [defaultColor], sizesRef.current),
                  },
                ],
          );
        } catch (error) {
          const message =
            error instanceof Error && error.message ? error.message : "No se pudo subir la imagen.";
          setErrors((current) => [...current, `${file.name}: ${message}`]);
        } finally {
          URL.revokeObjectURL(item.preview);
          setUploading((current) => current.filter((u) => u.id !== item.id));
        }
      }),
    );
  }

  function patch(id: string, next: Partial<CatalogDesign>) {
    onChange((previous) => previous.map((d) => (d.id === id ? { ...d, ...next } : d)));
  }

  function toggleColor(design: CatalogDesign, color: CatalogColor) {
    if (design.colors.includes(color)) {
      if (design.colors.length === 1) return notify("Cada diseño necesita al menos un color.");
      const colors = design.colors.filter((c) => c !== color);
      patch(design.id, { colors, stock: resizeStock(design.stock, colors, sizes) });
    } else {
      if (design.colors.length >= MAX_DESIGN_COLORS) {
        return notify(`Cada diseño admite hasta ${MAX_DESIGN_COLORS} colores.`);
      }
      const colors = palette
        .map((c) => c.name)
        .filter((name) => name === color || design.colors.includes(name));
      patch(design.id, { colors, stock: resizeStock(design.stock, colors, sizes) });
    }
  }

  function move(id: string, offset: -1 | 1) {
    onChange((previous) => {
      const index = previous.findIndex((d) => d.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(design: CatalogDesign) {
    if (designs.length === 1) return notify("El producto necesita al menos un diseño.");
    const before = designs;
    onChange((previous) => previous.filter((d) => d.id !== design.id));
    notify(`Diseño «${design.name || "sin nombre"}» quitado`, {
      label: "Deshacer",
      run: () => onChange(() => before),
    });
  }

  const nameCount = new Map<string, number>();
  for (const d of designs) {
    const key = normalizeText(d.name.trim());
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }

  return (
    <section
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          if (!fileOver) setFileOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setFileOver(false);
        void handleFiles(Array.from(event.dataTransfer.files));
      }}
      className={`${panel} relative flex flex-col gap-3.5 p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-[17px] font-bold">
            Diseños{" "}
            <span className="text-sm font-medium text-white/65">
              {total} / {MAX_DESIGNS}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-white/70">
            Cada foto es un diseño distinto, con su nombre, sus colores y su stock. Usa ← → para
            ordenar: el 1 es la portada.
          </p>
        </div>
        <button
          type="button"
          disabled={full}
          onClick={() => inputRef.current?.click()}
          className={`${softButton} !h-9 !px-3.5 !text-[13px]`}
        >
          Subir diseños
        </button>
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-theme-red/50 bg-theme-red/15 px-3 py-2.5 text-[13px]"
        >
          <div className="flex flex-1 flex-col gap-0.5">
            {errors.map((error, index) => (
              <span key={index}>{error}</span>
            ))}
          </div>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setErrors([])}
            className={`text-lg leading-none ${focusRing}`}
          >
            ×
          </button>
        </div>
      )}

      {total === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex min-h-[260px] flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-white/25 bg-black/20 p-6 text-center transition hover:border-theme-red hover:bg-theme-red/10 ${focusRing}`}
        >
          <strong className="text-base">Arrastra las fotos de los diseños aquí</strong>
          <span className="text-[13px] text-white/70">
            o toca para elegirlas · PNG, JPG o WebP · máx. {MAX_IMAGE_MB} MB c/u
          </span>
        </button>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-2.5">
          {designs.map((design, index) => {
            const emptyName = design.name.trim() === "";
            const duplicated = !emptyName && (nameCount.get(normalizeText(design.name.trim())) ?? 0) > 1;
            return (
              <li
                key={design.id}
                className={`flex min-w-0 flex-col overflow-hidden rounded-[14px] border-2 bg-black/35 ${
                  index === 0 ? "border-theme-red/55" : "border-white/10"
                }`}
              >
                <div
                  className="relative aspect-[4/5] overflow-hidden"
                  style={{
                    background: `linear-gradient(160deg, ${colorHex(palette, design.colors[0])}, #0a1c29)`,
                  }}
                >
                  <Image
                    src={design.image}
                    alt={`Diseño ${design.name || index + 1}`}
                    width={320}
                    height={400}
                    unoptimized
                    draggable={false}
                    className="absolute inset-0 size-full object-cover"
                  />
                  <div className="pointer-events-none absolute left-1.5 top-1.5 flex gap-1">
                    <span className="rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold">
                      {index + 1}
                    </span>
                    {index === 0 && (
                      <span className="rounded-full bg-theme-red px-2 py-[3px] text-[10px] font-extrabold tracking-[.06em]">
                        PORTADA
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-2.5">
                  <input
                    aria-label={`Nombre del diseño ${index + 1}`}
                    aria-invalid={emptyName || duplicated}
                    value={design.name}
                    maxLength={MAX_DESIGN_NAME}
                    placeholder="Nombre del diseño"
                    onChange={(event) => patch(design.id, { name: event.target.value })}
                    className={`${inputClass} !h-9 !text-[13px] ${
                      emptyName || duplicated ? "!border-theme-red" : ""
                    }`}
                  />
                  {(emptyName || duplicated) && (
                    <span role="alert" className="text-[11px] text-[#ff5a63]">
                      {emptyName ? "El nombre es obligatorio." : "Ya hay otro diseño con este nombre."}
                    </span>
                  )}
                  <div
                    role="group"
                    aria-label={`Colores del diseño ${index + 1}`}
                    className="flex flex-wrap gap-1.5"
                  >
                    {palette
                      .filter((c) => !c.hidden || design.colors.includes(c.name))
                      .map(({ name: color }) => {
                        const on = design.colors.includes(color);
                        return (
                          <button
                            key={color}
                            type="button"
                            aria-pressed={on}
                            aria-label={color}
                            title={color}
                            onClick={() => toggleColor(design, color)}
                            className={`size-7 rounded-full border-2 ${focusRing} ${
                              on ? "border-theme-red" : "border-white/20 opacity-50"
                            }`}
                            style={{ background: colorHex(palette, color) }}
                          />
                        );
                      })}
                  </div>
                </div>
                <div className="mt-auto flex h-9 items-center border-t border-white/10">
                  <button
                    type="button"
                    aria-label={`Mover diseño ${index + 1} a la izquierda`}
                    disabled={index === 0}
                    onClick={() => move(design.id, -1)}
                    className={`${iconButton} !size-9 !rounded-none !border-0`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover diseño ${index + 1} a la derecha`}
                    disabled={index === designs.length - 1}
                    onClick={() => move(design.id, 1)}
                    className={`${iconButton} !size-9 !rounded-none !border-0 !border-l !border-white/10`}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar diseño ${design.name || index + 1}`}
                    onClick={() => remove(design)}
                    className={`ml-auto h-9 border-l border-white/10 px-3 text-xs font-semibold text-[#ff5a63] hover:bg-theme-red hover:text-white ${focusRing}`}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}

          {uploading.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border-2 border-white/10 bg-black/35"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.preview}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-60"
                />
                <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-theme-navy/55 p-2">
                  <span className="text-[11px] font-semibold">Subiendo {item.pct}%</span>
                  <div
                    role="progressbar"
                    aria-label={`Subiendo ${item.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.pct}
                    className="h-1 overflow-hidden rounded-full bg-white/20"
                  >
                    <div
                      className="h-full bg-theme-red shadow-[0_0_8px_#ff2448] transition-all"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}

          {!full && (
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-white/25 p-3 text-center transition hover:border-theme-red hover:bg-theme-red/10 ${focusRing}`}
              >
                <span aria-hidden="true" className="text-2xl leading-none">+</span>
                <strong className="text-[13px]">Añadir diseño</strong>
                <span className="text-[11px] text-white/65">o arrastra archivos</span>
              </button>
            </li>
          )}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PRODUCT_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void handleFiles(files);
        }}
      />

      {fileOver && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[#ff294d] bg-theme-navy/90 shadow-[0_0_24px_rgba(255,35,62,0.45),inset_0_0_30px_rgba(216,26,33,0.3)]">
          <strong className="text-2xl tracking-wide [text-shadow:0_0_12px_rgba(216,26,33,0.6)]">
            Suelta para subir
          </strong>
          <span className="text-sm text-white/80">Cada foto será un diseño nuevo</span>
        </div>
      )}
    </section>
  );
}
