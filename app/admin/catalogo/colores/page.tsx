import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import ColorsAdmin from "@/app/admin/catalogo/_components/colors-admin";
import { loadAdminCatalog } from "@/app/admin/_lib";

async function ColorsData() {
  const catalog = await loadAdminCatalog();
  if (!catalog) return null;
  return <ColorsAdmin initial={catalog} />;
}

export default function AdminColorsPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <ColorsData />
    </Suspense>
  );
}
