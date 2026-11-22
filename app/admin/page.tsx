import { redirect } from "next/navigation";
import { Suspense } from "react";
import LinksAdmin from "@/app/admin/_components/links-admin";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import NoPermission from "@/app/admin/_components/no-permission";
import { loadAdminContent } from "@/app/admin/_lib";
import { can, firstAllowedPath, getSession } from "@/lib/auth";

async function LinksData() {
  // Sin permiso para los links, /admin lleva a la primera sección permitida.
  const session = await getSession();
  if (session && !can(session, "links.contenido.editar")) {
    const path = firstAllowedPath(session);
    if (path && path !== "/admin") redirect(path);
  }
  const content = await loadAdminContent();
  if (!content) return <NoPermission />;
  return <LinksAdmin initial={content} />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <LinksData />
    </Suspense>
  );
}
