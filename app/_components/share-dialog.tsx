"use client";

import { useRef, useState } from "react";
import SocialIcon from "@/app/_components/social-icon";
import type { SocialNetwork } from "@/lib/socials";

const SHARE_TEXT = "OverCity Streetwear";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

function buildNetworks(url: string): { id: SocialNetwork; label: string; href: string }[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(SHARE_TEXT);
  return [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "x", label: "X", href: `https://x.com/intent/post?url=${u}&text=${t}` },
    { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
    { id: "email", label: "Email", href: `mailto:?subject=${t}&body=${u}` },
  ];
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  }
}

export default function ShareDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Siempre se abre el modal propio (no la hoja nativa del sistema) para mantener el estilo.
  function open() {
    setUrl(window.location.href);
    setCopied(false);
    dialogRef.current?.showModal();
  }

  function closeOnBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    if (!inside) close();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function copy() {
    setCopied(await copyToClipboard(url));
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Compartir"
        className={`absolute right-4 top-4 rounded-full border border-border-soft bg-black/30 p-2.5 text-white backdrop-blur-md transition hover:border-theme-red hover:bg-theme-red/20 ${focusRing}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-5"
        >
          <path d="M12 15V3" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="share-title"
        onClick={closeOnBackdropClick}
        className="z-40 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-theme-red/50 bg-theme-navy p-6 text-white shadow-[0_0_30px_rgba(216,26,33,0.2)]"
      >
        <div className="flex items-center justify-between">
          <h2 id="share-title" className="text-lg font-semibold">
            Compartir OverCity
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className={`rounded-full p-2 transition hover:bg-theme-red/20 ${focusRing}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="size-5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={copy}
          className={`mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-theme-red bg-theme-red/20 px-5 py-3 font-semibold text-white shadow-[0_0_15px_rgba(216,26,33,0.2)] transition hover:bg-theme-red/40 ${focusRing}`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-5"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          Copiar enlace
        </button>
        <p role="status" className="mt-2 min-h-5 text-center text-sm text-white/80">
          {copied ? "¡Enlace copiado!" : ""}
        </p>

        <ul className="mt-3 flex flex-wrap items-center justify-center gap-4">
          {buildNetworks(url).map((n) => (
            <li key={n.id}>
              <a
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Compartir en ${n.label}`}
                title={n.label}
                className={`group flex size-14 items-center justify-center rounded-full border border-border-soft bg-black/30 text-theme-red drop-shadow-lg backdrop-blur-md transition duration-300 hover:border-theme-red hover:bg-theme-red/20 hover:text-white motion-safe:hover:-translate-y-1 ${focusRing}`}
              >
                <SocialIcon
                  network={n.id}
                  className="size-7 transition-transform duration-300 motion-safe:group-hover:scale-125"
                />
              </a>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
