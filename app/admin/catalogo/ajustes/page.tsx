import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import SettingsAdmin from "@/app/admin/catalogo/_components/settings-admin";
import { loadAdminCatalog } from "@/app/admin/_lib";

async function SettingsData() {
  const catalog = await loadAdminCatalog();
  if (!catalog) return null;
  return <SettingsAdmin initial={catalog} />;
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <SettingsData />
    </Suspense>
  );
}
