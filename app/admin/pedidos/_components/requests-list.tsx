"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ConfirmDialog,
  ghostButton,
  panel,
  softButton,
  Toast,
  useToast,
} from "@/app/admin/_components/ui";
import { Pager, SearchAndFilters } from "@/app/admin/pedidos/_components/list-controls";
import { discardRequest } from "@/app/admin/pedidos/actions";
import { formatPrice } from "@/lib/catalog-shared";
import {
  formatDateTime,
  orderSubtotal,
  type OrderRequest,
  type RequestStatus,
} from "@/lib/orders-shared";

const FILTERS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "convertida", label: "Convertidas" },
  { value: "descartada", label: "Descartadas" },
  { value: "todas", label: "Todas" },
];

const STATUS_NAMES: Record<RequestStatus, string> = {
  pendiente: "Pendiente",
  convertida: "Convertida",
  descartada: "Descartada",
};

export default function RequestsList({
  requests,
  total,
  status,
  search,
  page,
}: {
  requests: OrderRequest[];
  total: number;
  status: RequestStatus | "";
  search: string;
  page: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const active = status || "todas";

  function discard(code: string) {
    setPending(null);
    startTransition(async () => {
      const result = await discardRequest(code);
      show(result.ok ? `Solicitud ${code} descartada` : result.error);
      router.refresh();
    });
  }

  return (
    <>
      <SearchAndFilters
        base={{ tab: "solicitudes" }}
        search={search}
        placeholder="Buscar por código"
        filters={FILTERS}
        active={active}
      />
      {requests.length === 0 && (
        <p className={`${panel} px-4 py-7 text-sm text-white/70`}>
          {search || status !== "pendiente" || page > 1
            ? "Ninguna solicitud coincide."
            : "No hay solicitudes pendientes. Aparecen cuando un cliente envía su bolsa por WhatsApp."}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {requests.map((request) => {
          const unpriced = request.lines.some((line) => line.unitPrice === null);
          return (
            <li key={request.code} className={`${panel} flex flex-col gap-2.5 p-4`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-base tracking-wide">{request.code}</strong>
                <span className="text-xs text-white/65">
                  {formatDateTime(request.createdAt)} · {STATUS_NAMES[request.status]}
                </span>
              </div>
              <ul className="flex flex-col gap-1 text-[13px] text-white/85">
                {request.lines.map((line, index) => (
                  <li key={index} className="break-words">
                    {line.qty} × {line.productName} — {line.designName} · {line.color} · {line.size}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                <span className="text-sm">
                  Subtotal{" "}
                  <strong>{formatPrice(orderSubtotal(request.lines), request.currency)}</strong>
                  {unpriced && <span className="text-white/65"> (hay líneas sin precio)</span>}
                </span>
                {request.status === "pendiente" && (
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPending(request.code)}
                      className={ghostButton}
                    >
                      Descartar
                    </button>
                    <Link
                      href={`/admin/pedidos/nuevo?solicitud=${request.code}`}
                      className={softButton}
                    >
                      Convertir en pedido
                    </Link>
                  </span>
                )}
                {request.status === "convertida" && request.orderId && (
                  <Link href={`/admin/pedidos/${request.orderId}`} className={ghostButton}>
                    Ver pedido
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Pager
        total={total}
        page={page}
        params={{ tab: "solicitudes", estado: active, q: search }}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Descartar solicitud"
        confirmLabel="Descartar"
        onCancel={() => setPending(null)}
        onConfirm={() => pending && discard(pending)}
      >
        <p>La solicitud {pending} ya no se podrá convertir en pedido.</p>
      </ConfirmDialog>
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
