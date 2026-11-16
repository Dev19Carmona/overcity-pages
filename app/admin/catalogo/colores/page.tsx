import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import ColorsAdmin from "@/app/admin/catalogo/_components/colors-admin";
import { loadAdminColors } from "@/app/admin/_lib";

async function ColorsData() {
  const data = await loadAdminColors();
  if (!data) return null;
  return <ColorsAdmin initial={data} />;
}

export default function AdminColorsPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <ColorsData />
    </Suspense>
  );
}
