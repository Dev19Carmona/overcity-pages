import type { Metadata } from "next";
import NightScene from "@/app/_components/night-scene";

export const metadata: Metadata = { title: "Sección no disponible · OverCity" };

// 404 de las páginas públicas (SPEC 14): módulo apagado, producto inexistente o ruta desconocida.
export default function NotFound() {
  return (
    <>
      <NightScene effectsEnabled={false} />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <section className="w-full rounded-2xl border border-border-soft bg-black/30 p-6 backdrop-blur-md">
          <h1 className="premium-heading w-full text-lg font-semibold text-white">
            <span className="oni-mask" aria-hidden="true">👺</span>
            <span>Esta sección no está disponible</span>
            <span className="oni-mask" aria-hidden="true">👹</span>
          </h1>
        </section>
      </main>
    </>
  );
}
