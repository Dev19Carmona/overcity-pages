import { notFound } from "next/navigation";
import { Suspense } from "react";
import NoPermission from "@/app/admin/_components/no-permission";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import OrderEditor from "@/app/admin/pedidos/_components/order-editor";
import { loadAdminOrder } from "@/app/admin/_lib";

async function OrderData({ params }: { params: PageProps<"/admin/pedidos/[id]">["params"] }) {
  const { id } = await params;
  const data = await loadAdminOrder(id);
  if (!data) return <NoPermission />;
  if (!data.bundle) notFound();
  return (
    <OrderEditor
      key={data.bundle.order.id}
      initial={data.bundle}
      catalog={data.catalog}
      canVoid={data.canVoid}
      // La sesión ya se leyó (petición en curso): la hora del servidor es válida aquí.
      // eslint-disable-next-line react-hooks/purity
      serverNow={Date.now()}
      fromRequest={null}
    />
  );
}

export default function AdminOrderPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <OrderData params={params} />
    </Suspense>
  );
}
