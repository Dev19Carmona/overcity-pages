"use client";

import { useRef, useState } from "react";

const SHARE_TEXT = "OverCity Streetwear";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

function buildNetworks(url: string) {
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

  async function open() {
    const current = window.location.href;
    setUrl(current);
    setCopied(false);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: SHARE_TEXT, url: current });
        return;
      } catch {
        // Cancelado o fallido: se muestra el modal como respaldo.
      }
    }
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

  const itemClass = `block w-full rounded-full border border-border-soft bg-black/30 px-5 py-3 text-center font-semibold text-white transition hover:border-theme-red hover:bg-theme-red/20 ${focusRing}`;

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

        <ul className="mt-5 flex flex-col gap-3">
          <li>
            <button type="button" onClick={copy} className={itemClass}>
              Copiar enlace
            </button>
            <p role="status" className="mt-2 min-h-5 text-center text-sm text-white/80">
              {copied ? "¡Enlace copiado!" : ""}
            </p>
          </li>
          {buildNetworks(url).map((n) => (
            <li key={n.id}>
              <a
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                className={itemClass}
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
