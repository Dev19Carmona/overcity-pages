import { displayStatus, statusLabel, type DisplayStatus, type OrderStatus } from "@/lib/orders-shared";

const STYLES: Record<DisplayStatus, string> = {
  abierto: "border-white/30 bg-black/35 text-white",
  congelado: "border-theme-red bg-theme-red/25 text-white",
  vencido: "border-theme-red/60 bg-black/35 text-[#ffb0b4]",
  vendido: "border-white bg-white/15 text-white",
  cancelado: "border-white/15 bg-black/35 text-white/70",
  anulado: "border-theme-red/60 bg-black/35 text-[#ffb0b4]",
};

export default function StatusBadge({
  order,
  now,
}: {
  order: { status: OrderStatus; frozenUntil: string | null };
  now: number;
}) {
  return (
    <span
      className={`inline-flex w-max max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STYLES[displayStatus(order, now)]}`}
    >
      {statusLabel(order, now)}
    </span>
  );
}
