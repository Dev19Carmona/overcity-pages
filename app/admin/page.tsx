import { Suspense } from "react";
import LinksAdmin from "@/app/admin/_components/links-admin";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import { loadAdminContent } from "@/app/admin/_lib";

async function LinksData() {
  const content = await loadAdminContent();
  if (!content) return null;
  return <LinksAdmin initial={content} />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <LinksData />
    </Suspense>
  );
}
