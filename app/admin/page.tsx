import type { Metadata } from "next";
import { Suspense } from "react";
import Editor from "@/app/admin/_components/editor";
import LoginForm from "@/app/admin/_components/login-form";
import { isAdmin } from "@/lib/auth";
import { getContent } from "@/lib/content";

export const metadata: Metadata = {
  title: "Administración · OverCity",
  robots: { index: false, follow: false },
};

async function AdminGate() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Administración</h1>
        <LoginForm />
      </main>
    );
  }

  return <Editor initial={await getContent()} />;
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm">Cargando…</p>
        </main>
      }
    >
      <AdminGate />
    </Suspense>
  );
}
