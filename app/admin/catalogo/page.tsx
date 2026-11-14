import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import ProductsAdmin from "@/app/admin/catalogo/_components/products-admin";
import { loadAdminCatalog } from "@/app/admin/_lib";

async function ProductsData({ searchParams }: { searchParams: PageProps<"/admin/catalogo">["searchParams"] }) {
  const catalog = await loadAdminCatalog();
  if (!catalog) return null;
  const { categoria } = await searchParams;
  const initialCategory =
    typeof categoria === "string" && catalog.categories.some((c) => c.id === categoria)
      ? categoria
      : null;
  return <ProductsAdmin initial={catalog} initialCategory={initialCategory} />;
}

export default function AdminProductsPage({ searchParams }: PageProps<"/admin/catalogo">) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <ProductsData searchParams={searchParams} />
    </Suspense>
  );
}
