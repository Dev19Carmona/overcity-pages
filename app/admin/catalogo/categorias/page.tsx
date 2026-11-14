import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import CategoriesAdmin from "@/app/admin/catalogo/_components/categories-admin";
import { loadAdminCatalog } from "@/app/admin/_lib";

async function CategoriesData() {
  const catalog = await loadAdminCatalog();
  if (!catalog) return null;
  return <CategoriesAdmin initial={catalog} />;
}

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <CategoriesData />
    </Suspense>
  );
}
