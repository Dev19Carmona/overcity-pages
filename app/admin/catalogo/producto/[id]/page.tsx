import { notFound } from "next/navigation";
import { Suspense } from "react";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import ProductEditor from "@/app/admin/catalogo/_components/product-editor";
import { loadAdminEditor } from "@/app/admin/_lib";
import { MAX_PRODUCTS } from "@/lib/content-limits";

async function ProductData({
  params,
}: {
  params: PageProps<"/admin/catalogo/producto/[id]">["params"];
}) {
  const { id } = await params;
  const data = await loadAdminEditor(id);
  if (!data) return null;
  const { meta, entry, isNew } = data;

  if (isNew) {
    if (meta.productCount >= MAX_PRODUCTS) {
      return (
        <p className="text-sm">
          Ya tienes {MAX_PRODUCTS} productos, el máximo permitido. Elimina uno para crear otro.
        </p>
      );
    }
    return <ProductEditor key="nuevo" meta={meta} product={null} version={null} />;
  }

  if (!entry) notFound();
  return (
    <ProductEditor key={entry.product.id} meta={meta} product={entry.product} version={entry.version} />
  );
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
