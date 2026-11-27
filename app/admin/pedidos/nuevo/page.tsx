import { Suspense } from "react";
import NoPermission from "@/app/admin/_components/no-permission";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import OrderEditor from "@/app/admin/pedidos/_components/order-editor";
import { loadNewOrder } from "@/app/admin/_lib";

async function NewOrderData({
  searchParams,
}: {
  searchParams: PageProps<"/admin/pedidos/nuevo">["searchParams"];
}) {
  const { solicitud } = await searchParams;
  const code = typeof solicitud === "string" ? solicitud.trim().toUpperCase() : null;
  const data = await loadNewOrder(code);
  if (!data) return <NoPermission />;
  const { catalog, request, draft } = data;

  // El editor se monta siempre en el mismo sitio: al guardar, Next vuelve a renderizar esta ruta
  // (la solicitud ya figura como convertida) y no debe reemplazar el pedido que está en pantalla.
  const unavailable =
    code !== null && !draft
      ? {
          message:
            request?.status === "convertida"
              ? `La solicitud ${request.code} ya se convirtió en pedido.`
              : request?.status === "descartada"
                ? `La solicitud ${request.code} está descartada.`
                : "La solicitud no existe o ya venció.",
          orderId: request?.orderId ?? null,
        }
      : null;

  return (
    <OrderEditor
      key={code ?? "nuevo"}
      initial={null}
      unavailable={unavailable}
      catalog={catalog}
      canVoid={false}
      // La sesión ya se leyó (petición en curso): la hora del servidor es válida aquí.
      // eslint-disable-next-line react-hooks/purity
      serverNow={Date.now()}
      fromRequest={
        draft && code
          ? {
              code,
              lines: draft.lines,
              excluded: draft.excluded,
              products: draft.products,
              stock: draft.stock,
            }
          : null
      }
    />
  );
}

export default function NewOrderPage({ searchParams }: PageProps<"/admin/pedidos/nuevo">) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <NewOrderData searchParams={searchParams} />
    </Suspense>
  );
}
