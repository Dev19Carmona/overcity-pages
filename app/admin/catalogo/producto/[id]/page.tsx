import { notFound } from "next/navigation";
import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import ProductEditor from "@/app/admin/catalogo/_components/product-editor";
import { loadAdminCatalog } from "@/app/admin/_lib";
import { MAX_PRODUCTS } from "@/lib/content-limits";

async function ProductData({
  params,
}: {
  params: PageProps<"/admin/catalogo/producto/[id]">["params"];
}) {
  const [{ id }, catalog] = await Promise.all([params, loadAdminCatalog()]);
  if (!catalog) return null;

  if (id === "nuevo") {
    if (catalog.products.length >= MAX_PRODUCTS) {
      return (
        <p className="text-sm">
          Ya tienes {MAX_PRODUCTS} productos, el máximo permitido. Elimina uno para crear otro.
        </p>
      );
    }
    return <ProductEditor key="nuevo" catalog={catalog} product={null} />;
  }

  const product = catalog.products.find((item) => item.id === id);
  if (!product) notFound();
  return <ProductEditor key={product.id} catalog={catalog} product={product} />;
}

export default function AdminProductPage({
  params,
}: PageProps<"/admin/catalogo/producto/[id]">) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <ProductData params={params} />
    </Suspense>
  );
}
