import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import SettingsAdmin from "@/app/admin/catalogo/_components/settings-admin";
import { loadAdminSettings } from "@/app/admin/_lib";

async function SettingsData() {
  const settings = await loadAdminSettings();
  if (!settings) return null;
  return <SettingsAdmin initial={settings} />;
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <SettingsData />
    </Suspense>
  );
}
