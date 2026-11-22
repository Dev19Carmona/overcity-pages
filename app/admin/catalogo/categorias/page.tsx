import { Suspense } from "react";
import NoPermission from "@/app/admin/_components/no-permission";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import CategoriesAdmin from "@/app/admin/catalogo/_components/categories-admin";
import { loadAdminCategories } from "@/app/admin/_lib";

async function CategoriesData() {
  const catalog = await loadAdminCategories();
  if (!catalog) return <NoPermission />;
  return <CategoriesAdmin initial={catalog} />;
}

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <CategoriesData />
    </Suspense>
  );
}
