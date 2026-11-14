import type { Metadata } from "next";
import { Suspense } from "react";
import NightScene from "@/app/_components/night-scene";
import LoginForm from "@/app/admin/_components/login-form";
import CatalogEditor from "@/app/admin/catalogo/_components/catalog-editor";
import { isAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Catálogo · Administración · OverCity",
  robots: { index: false, follow: false },
};

async function CatalogGate() {
  if (!(await isAdmin())) {
    return (
      <>
        <NightScene />
        <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Administración</h1>
          <LoginForm />
        </main>
      </>
    );
  }

  return <CatalogEditor initial={await getCatalog()} />;
}

export default function AdminCatalogPage() {
  return (
    <Suspense
      fallback={
        <main className="relative z-10 flex flex-1 items-center justify-center">
          <p className="text-sm">Cargando…</p>
        </main>
      }
    >
      <CatalogGate />
    </Suspense>
  );
}
