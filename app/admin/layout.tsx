import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import NightScene from "@/app/_components/night-scene";
import { logoutAction } from "@/app/admin/actions";
import AdminNav from "@/app/admin/_components/admin-nav";
import LoginForm from "@/app/admin/_components/login-form";
import { isAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Administración · OverCity",
  robots: { index: false, follow: false },
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";
const sideLink = `flex shrink-0 items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-[13px] font-semibold text-white/85 transition hover:border-theme-red hover:text-white ${focusRing}`;

// Todo /admin: sesión obligatoria y panel con barra lateral (escritorio) o superior (móvil).
async function Gate({ children }: { children: ReactNode }) {
  if (!(await isAdmin())) {
    return (
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Administración</h1>
        <LoginForm />
      </main>
    );
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-1 flex-col min-[900px]:flex-row">
      <aside className="sticky top-0 z-30 flex flex-none items-center gap-2 border-b border-border-soft bg-black/45 px-3 py-2 backdrop-blur-[14px] min-[900px]:h-screen min-[900px]:w-[232px] min-[900px]:flex-col min-[900px]:items-stretch min-[900px]:gap-2 min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:px-3 min-[900px]:py-4">
        <div className="flex shrink-0 items-center gap-2.5 min-[900px]:px-1 min-[900px]:pb-3">
          <span className="relative block size-[34px] shrink-0 overflow-hidden rounded-full bg-white">
            <Image
              src="/overcity/logo-overcity.png"
              alt=""
              width={68}
              height={68}
              className="size-full object-contain"
            />
          </span>
          <span className="hidden flex-col leading-tight min-[900px]:flex">
            <strong className="text-[15px]">OverCity</strong>
            <span className="text-[11px] text-white/65">Administración</span>
          </span>
        </div>
        <AdminNav />
        <div className="flex shrink-0 gap-2 min-[900px]:flex-col">
          <Link href="/" className={sideLink}>
            <span aria-hidden="true">↗</span>
            <span className="hidden min-[900px]:inline">Ver sitio</span>
            <span className="sr-only min-[900px]:hidden">Ver sitio</span>
          </Link>
          <Link href="/catalogo" className={sideLink}>
            <span aria-hidden="true">↗</span>
            <span className="hidden min-[900px]:inline">Ver tienda</span>
            <span className="sr-only min-[900px]:hidden">Ver tienda</span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className={`${sideLink} w-full`}>
              <span aria-hidden="true">⏻</span>
              <span className="hidden min-[900px]:inline">Cerrar sesión</span>
              <span className="sr-only min-[900px]:hidden">Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 min-[900px]:p-8">{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NightScene effectsEnabled={false} />
      <Suspense
        fallback={
          <main className="relative z-10 flex flex-1 items-center justify-center">
            <p className="text-sm">Cargando…</p>
          </main>
        }
      >
        <Gate>{children}</Gate>
      </Suspense>
    </>
  );
}
