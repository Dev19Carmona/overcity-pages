// Esqueleto que se ve mientras una pantalla del panel lee la sesión y los datos.
// Cada página del panel lo usa como `fallback` de su propio <Suspense>, para que la navegación
// entre secciones sea instantánea.
export default function PanelFallback() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
      <div className="h-64 w-full animate-pulse rounded-2xl border border-border-soft bg-black/30 motion-reduce:animate-none" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
