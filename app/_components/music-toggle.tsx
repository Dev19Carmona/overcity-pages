"use client";

import { useEffect, useRef, useState } from "react";

// Botón flotante de solo icono (z-30), arriba a la izquierda.
// La música intenta sonar al cargar; si el navegador bloquea el audio automático,
// empieza con la primera interacción del visitante (toque, clic o tecla).
export default function MusicToggle({
  src,
  inline = false,
}: {
  src: string;
  inline?: boolean; // true = dentro de una barra (panel); false = flotante arriba a la izquierda
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.68;

    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const removeGestureListeners = () =>
      events.forEach((name) => window.removeEventListener(name, onGesture));

    // Un gesto sobre el propio botón lo maneja su onClick, no este listener.
    function onGesture(event: Event) {
      if (buttonRef.current?.contains(event.target as Node)) return;
      removeGestureListeners();
      void audio?.play().catch(() => setFailed(true));
    }

    audio.play().catch(() => {
      // Autoplay bloqueado: se espera la primera interacción.
      events.forEach((name) =>
        window.addEventListener(name, onGesture, { passive: true }),
      );
    });

    return removeGestureListeners;
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      setFailed(false);
      await audio.play();
    } catch (error) {
      console.error("No se pudo iniciar la música:", error);
      setFailed(true);
    }
  }

  const label = playing ? "Silenciar música" : failed ? "Reintentar música" : "Activar música";

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        loop
        playsInline
        onPlaying={() => {
          setPlaying(true);
          setFailed(false);
        }}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void toggle()}
        aria-label={label}
        aria-pressed={playing}
        title={label}
        className={`${
          inline ? "relative size-9" : "fixed left-3 top-3 z-30 size-11 sm:left-[18px] sm:top-[18px]"
        } flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-theme-red/65 bg-theme-navy/90 text-theme-red shadow-[0_0_18px_rgba(216,26,33,0.18)] backdrop-blur-md transition duration-300 hover:bg-theme-red/25 hover:text-white hover:shadow-[0_0_22px_rgba(216,26,33,0.38)] motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-6 drop-shadow-lg"
        >
          <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" />
          {playing ? (
            <>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          ) : (
            <>
              <path d="m22 9-6 6" />
              <path d="m16 9 6 6" />
            </>
          )}
        </svg>
      </button>
    </>
  );
}
