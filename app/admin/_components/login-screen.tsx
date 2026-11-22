"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Mensajes desde un mapa fijo de códigos; uno desconocido muestra el genérico (nunca se refleja el query).
const ERRORS: Record<string, string> = {
  access_denied: "No se aprobó el acceso. Vuelve a intentarlo.",
  invalid_state: "La solicitud de entrada no es válida. Vuelve a intentarlo.",
  session_expired: "Tu intento de entrada caducó. Vuelve a intentarlo.",
  not_configured: "El inicio de sesión no está configurado.",
  generic: "No se pudo iniciar sesión. Intenta de nuevo.",
};

function LoginBody() {
  const params = useSearchParams();
  const pathname = usePathname();
  const code = params.get("error");
  const message = code ? (ERRORS[code] ?? ERRORS.generic) : null;
  const href = `/auth/login?returnTo=${encodeURIComponent(pathname)}`;

  return (
    <div className="flex w-full flex-col gap-4">
      <p className="text-sm text-white/85">Entra con tu cuenta para administrar OverCity.</p>
      {message && (
        <p role="alert" className="text-sm font-semibold text-red-300">
          {message}
        </p>
      )}
      {/* Enlace normal (no <Link>): evita el prefetch de una ruta que redirige fuera del sitio. */}
      <a
        href={href}
        className="w-full rounded-full border border-theme-red bg-theme-red/20 px-6 py-4 text-center text-base font-semibold transition hover:bg-theme-red/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red"
      >
        Entrar con tu cuenta
      </a>
    </div>
  );
}

export default function LoginScreen() {
  return (
    <Suspense fallback={null}>
      <LoginBody />
    </Suspense>
  );
}
