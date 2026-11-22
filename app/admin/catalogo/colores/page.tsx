import { Suspense } from "react";
import NoPermission from "@/app/admin/_components/no-permission";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import ColorsAdmin from "@/app/admin/catalogo/_components/colors-admin";
import { loadAdminColors } from "@/app/admin/_lib";

async function ColorsData() {
  const data = await loadAdminColors();
  if (!data) return <NoPermission />;
  return <ColorsAdmin initial={data} />;
}

export default function AdminColorsPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <ColorsData />
    </Suspense>
  );
}
