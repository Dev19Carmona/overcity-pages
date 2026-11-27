import { panel } from "@/app/admin/_components/ui";
import { formatPrice, type CatalogCurrency } from "@/lib/catalog-shared";
import { PAYMENT_LABELS, formatDateTime, type OrderEvent } from "@/lib/orders-shared";

const TITLES: Record<OrderEvent["type"], string> = {
  creado: "Pedido creado",
  editado: "Pedido editado",
  congelado: "Congelado",
  renovado: "Congelamiento renovado",
  liberado: "Congelamiento liberado",
  vendido: "Vendido",
  cancelado: "Pedido cancelado",
  anulado: "Venta anulada",
  comprobante: "Comprobante",
};

function description(event: OrderEvent, currency: CatalogCurrency): string {
  const { detail } = event;
  switch (event.type) {
    case "creado":
    case "editado": {
      const parts = [
        detail.requestCode ? `Desde la solicitud ${detail.requestCode}` : "",
        detail.lines ? `${detail.lines} ${detail.lines === 1 ? "línea" : "líneas"}` : "",
        typeof detail.total === "number" ? `total ${formatPrice(detail.total, currency)}` : "",
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "congelado":
    case "renovado":
      return detail.until ? `${detail.hours} h, hasta el ${formatDateTime(detail.until)}` : "";
    case "vendido":
      return [
        detail.method ? PAYMENT_LABELS[detail.method] : "",
        detail.proof ? "con comprobante" : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "anulado": {
      const missing = (detail.notRestored ?? []).map(
        (line) =>
          `${line.qty} × ${line.productName} — ${line.designName} · ${line.color} · ${line.size}`,
      );
      return [
        `Motivo: ${detail.reason ?? ""}`,
        missing.length ? `No se devolvió al stock: ${missing.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join(". ");
    }
    case "comprobante":
      return detail.replaced ? "Reemplazado" : "Adjuntado";
    default:
      return "";
  }
}

export default function OrderHistory({
  events,
  currency,
}: {
  events: OrderEvent[];
  currency: CatalogCurrency;
}) {
  return (
    <section className={`${panel} flex flex-col gap-3 p-4`}>
      <h2 className="text-[17px] font-bold">Historial</h2>
      <ol className="flex flex-col gap-2.5">
        {events.map((event) => {
          const text = description(event, currency);
          return (
            <li key={event.id} className="border-l-2 border-theme-red/60 pl-3 text-sm">
              <strong>{TITLES[event.type]}</strong>
              <span className="block text-xs text-white/65">
                {formatDateTime(event.createdAt)} · {event.actorName}
              </span>
              {text && <span className="block break-words text-[13px] text-white/85">{text}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
