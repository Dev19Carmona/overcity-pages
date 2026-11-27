"use client";

import Link from "next/link";
import { focusRing, panel } from "@/app/admin/_components/ui";
import { Pager, SearchAndFilters } from "@/app/admin/pedidos/_components/list-controls";
import StatusBadge from "@/app/admin/pedidos/_components/status-badge";
import { formatPrice } from "@/lib/catalog-shared";
import {
  STATUS_FILTERS,
  formatDateTime,
  formatOrderNumber,
  type OrderSummary,
} from "@/lib/orders-shared";

const COLUMNS = "min-[900px]:grid-cols-[80px_minmax(0,2fr)_1fr_minmax(0,1.6fr)_1.2fr]";

export default function OrdersList({
  orders,
  total,
  status,
  search,
  page,
  now,
}: {
  orders: OrderSummary[];
  total: number;
  status: string;
  search: string;
  page: number;
  now: number;
}) {
  return (
    <>
      <SearchAndFilters
        base={{}}
        search={search}
        placeholder="Buscar por número, código, nombre o teléfono"
        filters={STATUS_FILTERS}
        active={status}
      />
      <div className={`${panel} overflow-hidden`}>
        <div
          className={`hidden gap-3.5 border-b border-border-soft px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-white/60 min-[900px]:grid ${COLUMNS}`}
        >
          <span>Número</span>
          <span>Cliente</span>
          <span>Total</span>
          <span>Estado</span>
          <span>Fecha</span>
        </div>
        {orders.length === 0 && (
          <p className="px-4 py-7 text-sm text-white/70">
            {status || search || page > 1
              ? "Ningún pedido coincide."
              : "Aún no hay pedidos. Crea uno o convierte una solicitud."}
          </p>
        )}
        <ul>
          {orders.map((order) => (
            <li key={order.id} className="border-b border-white/[0.07] last:border-b-0">
              <Link
                href={`/admin/pedidos/${order.id}`}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 px-4 py-3 text-sm transition hover:bg-white/[0.04] ${focusRing} !outline-offset-[-2px] ${COLUMNS}`}
              >
                <strong>{formatOrderNumber(order.number)}</strong>
                <span className="order-3 truncate min-[900px]:order-none">
                  {order.customerName || <span className="text-white/60">Sin nombre</span>}
                </span>
                <span className="text-right font-semibold min-[900px]:text-left">
                  {formatPrice(order.total, order.currency)}
                </span>
                <span className="order-4 justify-self-end min-[900px]:order-none min-[900px]:justify-self-start">
                  <StatusBadge order={order} now={now} />
                </span>
                <span className="order-5 col-span-2 text-xs text-white/65 min-[900px]:order-none min-[900px]:col-span-1">
                  {formatDateTime(order.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Pager total={total} page={page} params={{ estado: status, q: search }} />
    </>
  );
}
