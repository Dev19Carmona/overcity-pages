"use client";

import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  chipClass,
  focusRing,
  ghostButton,
  iconButton,
  panel,
  softButton,
} from "@/app/admin/_components/ui";
import {
  CATALOG_COLOR_HEX,
  type CatalogColor,
  type CatalogImage,
} from "@/lib/catalog-shared";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/content-limits";

type Uploading = { id: string; name: string; preview: string; pct: number; color: CatalogColor };

type Updater = (previous: CatalogImage[]) => CatalogImage[];

const selectClass = `h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs font-semibold text-white ${focusRing}`;

// Imágenes de un producto: hasta 8, la primera es la portada, con color por foto.
// La subida va directo del navegador a Vercel Blob; solo cambia el borrador hasta guardar.
export default function ProductImages({
  productName,
  images,
  colors,
  onChange,
  onBusyChange,
  notify,
}: {
  productName: string;
  images: CatalogImage[];
  colors: CatalogColor[];
  onChange: (update: Updater) => void;
  onBusyChange: (busy: boolean) => void;
  notify: (message: string, action?: { label: string; run: () => void }) => void;
}) {
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [filter, setFilter] = useState<"Todas" | CatalogColor>("Todas");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragUrl, setDragUrl] = useState<string | null>(null);
  const [overUrl, setOverUrl] = useState<string | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // El filtro y la selección se ajustan si cambian los colores o las fotos.
  const activeFilter = filter !== "Todas" && !colors.includes(filter) ? "Todas" : filter;
  const total = images.length + uploading.length;
  const full = total >= MAX_PRODUCT_IMAGES;
  const visibleImages =
    activeFilter === "Todas" ? images : images.filter((image) => image.color === activeFilter);
  const selectedCount = images.filter((image) => selected.has(image.url)).length;

  useEffect(() => {
    onBusyChange(uploading.length > 0);
  }, [uploading.length, onBusyChange]);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const problems: string[] = [];
    let room = MAX_PRODUCT_IMAGES - total;
    const accepted: File[] = [];
    for (const file of files) {
      if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
        problems.push(`${file.name}: solo PNG, JPG o WebP.`);
      } else if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
        problems.push(`${file.name}: pesa ${(file.size / 1048576).toFixed(1)} MB (máximo 2 MB).`);
      } else if (room <= 0) {
        problems.push(`${file.name}: ya llegaste a ${MAX_PRODUCT_IMAGES} fotos.`);
      } else {
        room -= 1;
        accepted.push(file);
      }
    }
    setErrors(problems);

    const color = activeFilter !== "Todas" ? activeFilter : colors[0];
    const items: Uploading[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      preview: URL.createObjectURL(file),
      pct: 0,
      color,
    }));
    if (items.length === 0) return;
    setUploading((current) => [...current, ...items]);

    await Promise.all(
      accepted.map(async (file, index) => {
        const item = items[index];
        try {
          const blob = await upload(`catalog/${file.name}`, file, {
            access: "public",
            handleUploadUrl: "/api/media",
            contentType: file.type,
            onUploadProgress: ({ percentage }) =>
              setUploading((current) =>
                current.map((u) => (u.id === item.id ? { ...u, pct: Math.round(percentage) } : u)),
              ),
          });
          onChange((previous) =>
            previous.length >= MAX_PRODUCT_IMAGES
              ? previous
              : [...previous, { url: blob.url, color: item.color }],
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

  function move(url: string, offset: -1 | 1) {
    onChange((previous) => {
      const index = previous.findIndex((image) => image.url === url);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function moveTo(fromUrl: string, toUrl: string) {
    if (fromUrl === toUrl) return;
    onChange((previous) => {
      const from = previous.findIndex((image) => image.url === fromUrl);
      const to = previous.findIndex((image) => image.url === toUrl);
      if (from < 0 || to < 0) return previous;
      const next = [...previous];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function setColor(urls: string[], color: CatalogColor) {
    onChange((previous) =>
      previous.map((image) => (urls.includes(image.url) ? { ...image, color } : image)),
    );
  }

  function remove(urls: string[]) {
    const before = images;
    onChange((previous) => previous.filter((image) => !urls.includes(image.url)));
    setSelected(new Set());
    notify(urls.length === 1 ? "Foto eliminada" : `${urls.length} fotos eliminadas`, {
      label: "Deshacer",
      run: () => onChange(() => before),
    });
  }

  const hint = "Arrastra para ordenar o usa ← →. La 1 es la portada.";

  return (
    <section
      onDragOver={(event) => {
        if (dragUrl) return;
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          if (!fileOver) setFileOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(event) => {
        if (dragUrl) return;
        event.preventDefault();
        setFileOver(false);
        void handleFiles(Array.from(event.dataTransfer.files));
      }}
      className={`${panel} relative flex flex-col gap-3.5 p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-[17px] font-bold">
            Imágenes{" "}
            <span className="text-sm font-medium text-white/65">
              {total} / {MAX_PRODUCT_IMAGES}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-white/70">{hint}</p>
        </div>
        <div className="flex gap-2">
          {images.length > 0 && (
            <button
              type="button"
              aria-pressed={selecting}
              onClick={() => {
                setSelecting((current) => !current);
                setSelected(new Set());
              }}
              className={`${ghostButton} !h-9 !px-3.5 !text-[13px] ${selecting ? "bg-white/15" : ""}`}
            >
              {selecting ? "Listo" : "Seleccionar"}
            </button>
          )}
          <button
            type="button"
            disabled={full}
            onClick={() => inputRef.current?.click()}
            className={`${softButton} !h-9 !px-3.5 !text-[13px]`}
          >
            Subir fotos
          </button>
        </div>
      </div>

      {images.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setFilter("Todas")}
            className={`${chipClass(activeFilter === "Todas")} !px-3 !py-1.5 !text-xs`}
          >
            Todas <span className="opacity-60">{images.length}</span>
          </button>
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setFilter(color)}
              className={`${chipClass(activeFilter === color)} flex items-center gap-1.5 !px-3 !py-1.5 !text-xs`}
            >
              <span
                aria-hidden="true"
                className="size-3 rounded-full border border-white/40"
                style={{ background: CATALOG_COLOR_HEX[color] }}
              />
              {color}
              <span className="opacity-60">
                {images.filter((image) => image.color === color).length}
              </span>
            </button>
          ))}
        </div>
      )}

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

      {selecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.07] px-2.5 py-2 text-[13px]">
          <strong className="mr-auto">
            {selectedCount
              ? `${selectedCount} ${selectedCount === 1 ? "seleccionada" : "seleccionadas"}`
              : "Toca las fotos para seleccionarlas"}
          </strong>
          <button
            type="button"
            onClick={() => setSelected(new Set(visibleImages.map((image) => image.url)))}
            className={`${ghostButton} !h-8 !px-3 !text-xs`}
          >
            Todas
          </button>
          <select
            aria-label="Asignar color a las seleccionadas"
            value=""
            disabled={selectedCount === 0}
            onChange={(event) => {
              const color = event.target.value as CatalogColor;
              if (!color) return;
              setColor([...selected], color);
              notify(`${selectedCount} ${selectedCount === 1 ? "foto" : "fotos"} → ${color}`);
            }}
            className={`h-8 rounded-full border border-white/20 bg-black/35 px-2.5 text-xs text-white disabled:opacity-45 ${focusRing}`}
          >
            <option value="" className="bg-theme-navy">
              Asignar color…
            </option>
            {colors.map((color) => (
              <option key={color} value={color} className="bg-theme-navy">
                {color}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => remove([...selected])}
            className={`${softButton} !h-8 !bg-theme-red !px-3 !text-xs`}
          >
            Eliminar
          </button>
        </div>
      )}

      {total === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex min-h-[260px] flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-white/25 bg-black/20 p-6 text-center transition hover:border-theme-red hover:bg-theme-red/10 ${focusRing}`}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
          </svg>
          <strong className="text-base">Arrastra las fotos aquí</strong>
          <span className="text-[13px] text-white/70">
            o toca para elegirlas · PNG, JPG o WebP · máx. 2 MB c/u
          </span>
        </button>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5 min-[900px]:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
          {visibleImages.map((image) => {
            const index = images.indexOf(image);
            const isSelected = selected.has(image.url);
            const isOver = dragUrl !== null && overUrl === image.url && dragUrl !== image.url;
            return (
              <li
                key={image.url}
                draggable={!selecting}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  try {
                    event.dataTransfer.setData("text/plain", image.url);
                  } catch {
                    // Algunos navegadores no permiten setData; el estado propio basta.
                  }
                  setDragUrl(image.url);
                }}
                onDragOver={(event) => {
                  if (!dragUrl) return;
                  event.preventDefault();
                  if (overUrl !== image.url) setOverUrl(image.url);
                }}
                onDrop={(event) => {
                  if (!dragUrl) return;
                  event.preventDefault();
                  event.stopPropagation();
                  moveTo(dragUrl, image.url);
                  setDragUrl(null);
                  setOverUrl(null);
                }}
                onDragEnd={() => {
                  setDragUrl(null);
                  setOverUrl(null);
                }}
                className={`flex min-w-0 flex-col overflow-hidden rounded-[14px] border-2 bg-black/35 transition ${
                  isOver || isSelected
                    ? "border-theme-red"
                    : index === 0
                      ? "border-theme-red/55"
                      : "border-white/10"
                } ${dragUrl === image.url ? "opacity-35" : ""} ${isOver ? "scale-[1.03]" : ""}`}
              >
                <div
                  className="relative aspect-[4/5] overflow-hidden"
                  style={{
                    background: `linear-gradient(160deg, ${CATALOG_COLOR_HEX[image.color]}, #0a1c29)`,
                  }}
                >
                  <Image
                    src={image.url}
                    alt={`${productName || "Producto"}, imagen ${index + 1}`}
                    width={320}
                    height={400}
                    unoptimized
                    draggable={false}
                    className="absolute inset-0 size-full object-cover"
                  />
                  {selecting && (
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Seleccionar imagen ${index + 1}`}
                      onClick={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (!next.delete(image.url)) next.add(image.url);
                          return next;
                        })
                      }
                      className={`absolute inset-0 ${focusRing}`}
                    />
                  )}
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
                  {selecting && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-white text-xs font-bold ${
                        isSelected ? "bg-theme-red" : "bg-black/45"
                      }`}
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                  )}
                </div>
                <div className="flex h-9 items-center border-t border-white/10">
                  <span
                    aria-hidden="true"
                    className="ml-2.5 size-2.5 shrink-0 rounded-full border border-white/40"
                    style={{ background: CATALOG_COLOR_HEX[image.color] }}
                  />
                  <select
                    aria-label={`Color de la imagen ${index + 1}`}
                    value={image.color}
                    onChange={(event) => setColor([image.url], event.target.value as CatalogColor)}
                    className={selectClass}
                  >
                    {colors.map((color) => (
                      <option key={color} value={color} className="bg-theme-navy">
                        {color}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Mover imagen ${index + 1} a la izquierda`}
                    disabled={index === 0}
                    onClick={() => move(image.url, -1)}
                    className={`${iconButton} !size-9 !rounded-none !border-0 !border-l !border-white/10`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover imagen ${index + 1} a la derecha`}
                    disabled={index === images.length - 1}
                    onClick={() => move(image.url, 1)}
                    className={`${iconButton} !size-9 !rounded-none !border-0 !border-l !border-white/10`}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar imagen ${index + 1}`}
                    onClick={() => remove([image.url])}
                    className={`${iconButton} !size-9 !rounded-none !border-0 !border-l !border-white/10 hover:!bg-theme-red`}
                  >
                    ✕
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
                <strong className="text-[13px]">Añadir</strong>
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
          <span className="text-sm text-white/80">
            Se asignarán al color {activeFilter !== "Todas" ? activeFilter : colors[0]}
          </span>
        </div>
      )}
    </section>
  );
}
