"use client";

import Image from "next/image";
import { DEFAULT_LOGO } from "@/app/_components/site-view";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

const actionButton =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-theme-red bg-theme-red/20 px-5 py-2 text-sm font-semibold transition hover:bg-theme-red/40 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-theme-red";

export default function LogoUploader({
  logoUrl,
  busy,
  onUpload,
  onRemove,
  onError,
}: {
  logoUrl: string | null;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      onError("La imagen debe ser PNG, JPG o WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      onError("La imagen no puede superar 2 MB.");
      return;
    }
    onUpload(file);
  }

  return (
    <section
      aria-label="Logo"
      className="mb-4 flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-white/30 bg-black/30 p-4 backdrop-blur-md"
    >
      <div className="flex h-28 w-full items-center justify-center rounded-xl bg-black/30">
        <Image
          src={logoUrl ?? DEFAULT_LOGO}
          alt={logoUrl ? "Logo actual" : "Logo por defecto"}
          width={710}
          height={257}
          unoptimized
          className="h-20 w-auto max-w-full object-contain drop-shadow-[0_0_12px_rgba(216,26,33,0.48)]"
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className={`${actionButton} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "Subiendo…" : logoUrl ? "Cambiar logo" : "Subir logo propio"}
          <input
            type="file"
            accept={ACCEPTED.join(",")}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleFile(file);
            }}
            className="sr-only"
          />
        </label>
        {logoUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="rounded-full border border-border-soft px-5 py-2 text-sm font-semibold transition hover:border-theme-red disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red"
          >
            Quitar logo
          </button>
        )}
      </div>

      <p className="text-xs">PNG, JPG o WebP · máximo 2 MB</p>
    </section>
  );
}
