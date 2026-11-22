import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";
import { firstAllowedPath, getSession } from "@/lib/auth";

// Con sesión pero sin el permiso de la pantalla: contenido de 403 con HTTP 200 y ningún dato.
export default async function NoPermission() {
  const session = await getSession();
  const path = firstAllowedPath(session);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-theme-red/50 bg-black/30 p-6 text-center backdrop-blur-md">
      <h1 className="text-xl font-extrabold tracking-tight">Sin permiso</h1>
      <p className="text-sm text-white/85">Tu cuenta no tiene permisos para esta sección.</p>
      {path && (
        <Link
          href={path}
          className="rounded-full border border-border-soft px-5 py-3 text-sm font-semibold transition hover:border-theme-red focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red"
        >
          Ir a una sección permitida
        </Link>
      )}
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-full border border-theme-red bg-theme-red/20 px-5 py-3 text-sm font-semibold transition hover:bg-theme-red/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red"
        >
          Cerrar sesión
        </button>
      </form>
    </section>
  );
}
