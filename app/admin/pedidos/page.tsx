import Link from "next/link";
import { Suspense } from "react";
import NoPermission from "@/app/admin/_components/no-permission";
import PanelFallback from "@/app/admin/_components/panel-fallback";
import OrdersList from "@/app/admin/pedidos/_components/orders-list";
import RequestsList from "@/app/admin/pedidos/_components/requests-list";
import { loadAdminOrders, loadAdminRequests } from "@/app/admin/_lib";
import { STATUS_FILTERS, type RequestStatus } from "@/lib/orders-shared";

type Params = PageProps<"/admin/pedidos">["searchParams"];

const REQUEST_STATUSES: RequestStatus[] = ["pendiente", "convertida", "descartada"];

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

async function PedidosData({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const search = one(params.q).slice(0, 80);
  const page = Math.max(1, Math.min(Number.parseInt(one(params.pagina), 10) || 1, 10_000));
  const estado = one(params.estado);

  if (one(params.tab) === "solicitudes") {
    // Sin el parámetro, solo las pendientes; `estado=todas` las muestra todas.
    const status =
      estado === "todas" ? "" : (REQUEST_STATUSES.find((item) => item === estado) ?? "pendiente");
    const data = await loadAdminRequests({ status, search, page });
    if (!data) return <NoPermission />;
    return (
      <>
        <Header tab="solicitudes" />
        <RequestsList {...data} status={status} search={search} page={page} />
      </>
    );
  }

  const status = STATUS_FILTERS.find((item) => item.value === estado)?.value ?? "";
  const data = await loadAdminOrders({ status, search, page });
  if (!data) return <NoPermission />;
  // La sesión ya se leyó (petición en curso): la hora del servidor es válida aquí.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <>
      <Header tab="pedidos" />
      <OrdersList {...data} status={status} search={search} page={page} now={now} />
    </>
  );
}

function Header({ tab }: { tab: "pedidos" | "solicitudes" }) {
  const tabClass = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-semibold transition hover:border-theme-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red ${
      active ? "border-theme-red bg-theme-red/25" : "border-white/15 bg-black/35"
    }`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold tracking-wide">Pedidos</h1>
        <Link
          href="/admin/pedidos/nuevo"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-theme-red bg-theme-red px-5 py-2.5 text-sm font-semibold transition hover:shadow-[0_0_18px_rgba(216,26,33,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red"
        >
          <span aria-hidden="true">+</span> Nuevo pedido
        </Link>
      </div>
      <nav aria-label="Pedidos y solicitudes" className="flex gap-2">
        <Link
          href="/admin/pedidos"
          aria-current={tab === "pedidos" ? "page" : undefined}
          className={tabClass(tab === "pedidos")}
        >
          Pedidos
        </Link>
        <Link
          href="/admin/pedidos?tab=solicitudes"
          aria-current={tab === "solicitudes" ? "page" : undefined}
          className={tabClass(tab === "solicitudes")}
        >
          Solicitudes
        </Link>
      </nav>
    </>
  );
}

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <PedidosData searchParams={searchParams} />
    </Suspense>
  );
}
