"use client";

import { useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "playing" | "error";

const LABELS: Record<State, string> = {
  idle: "♫ Activar música",
  loading: "♫ Cargando música…",
  playing: "♫ Pausar música",
  error: "♫ Reintentar música",
};

// Botón flotante (z-30). El MP3 no se pide hasta que el visitante lo pulsa (preload="none").
export default function MusicToggle() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = 0.68;
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || state === "loading") return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    setState("loading");
    try {
      await audio.play();
      setState("playing");
    } catch (error) {
      console.error("No se pudo iniciar la música:", error);
      setState("error");
    }
  }

  const playing = state === "playing";

  return (
    <>
      <audio
        ref={audioRef}
        src="/overcity/musica-fondo.mp3"
        preload="none"
        loop
        playsInline
        onPlaying={() => setState("playing")}
        onPause={() => setState("idle")}
        onError={() => setState("error")}
      />
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={state === "loading"}
        aria-label={playing ? "Pausar música japonesa" : "Activar música japonesa"}
        aria-pressed={playing}
        title={
          state === "error"
            ? "No se pudo cargar la música. Intenta de nuevo."
            : playing
              ? "La música japonesa está sonando"
              : "Activar música japonesa de fondo"
        }
        className="fixed bottom-3 right-3 z-30 cursor-pointer rounded-full border border-theme-red/65 bg-theme-navy/90 px-[13px] py-[9px] text-xs font-semibold tracking-[0.04em] text-white shadow-[0_0_18px_rgba(216,26,33,0.18)] backdrop-blur-md transition duration-300 hover:bg-theme-red/25 hover:shadow-[0_0_22px_rgba(216,26,33,0.38)] disabled:cursor-wait sm:bottom-[18px] sm:right-[18px] sm:px-[15px] sm:py-[10px] motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red"
      >
        {LABELS[state]}
      </button>
    </>
  );
}
