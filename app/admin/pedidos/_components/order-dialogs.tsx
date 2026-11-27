"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  chipClass,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
} from "@/app/admin/_components/ui";
import NumberInput from "@/app/admin/pedidos/_components/money-input";
import { proofProblem, uploadProof } from "@/app/admin/pedidos/_components/proof-upload";
import { formatPrice, type CatalogCurrency } from "@/lib/catalog-shared";
import {
  DEFAULT_FREEZE_HOURS,
  MAX_FREEZE_HOURS,
  MAX_PAYMENT_NOTE,
  MAX_VOID_REASON,
  PROOF_TYPES,
} from "@/lib/content-limits";
import {
  FREEZE_PRESETS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type OrderLine,
  type PaymentMethod,
} from "@/lib/orders-shared";

const fileInput =
  "w-full min-w-0 text-[13px] text-white file:mr-3 file:rounded-full file:border file:border-white/25 file:bg-black/35 file:px-3.5 file:py-2 file:text-[13px] file:font-semibold file:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

// Modal del panel (estilo SPEC 04). Se monta solo cuando está abierto, así su estado empieza limpio.
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-sm overflow-y-auto rounded-2xl border border-theme-red/50 bg-theme-navy p-0 text-white shadow-[0_0_30px_rgba(216,26,33,0.25)] backdrop:bg-[rgba(10,28,41,0.85)] backdrop:backdrop-blur-[4px]"
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

function Footer({
  confirmLabel,
  disabled,
  onConfirm,
  onClose,
}: {
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onClose} className={ghostButton}>
        Volver
      </button>
      <button type="button" onClick={onConfirm} disabled={disabled} className={primaryButton}>
        {confirmLabel}
      </button>
    </div>
  );
}

export function FreezeDialog({
  renew,
  onClose,
  onConfirm,
}: {
  renew: boolean;
  onClose: () => void;
  onConfirm: (hours: number) => void;
}) {
  const [hours, setHours] = useState<number | null>(DEFAULT_FREEZE_HOURS);
  const valid = hours !== null && hours >= 1;
  return (
    <Modal title={renew ? "Renovar congelamiento" : "Congelar pedido"} onClose={onClose}>
      <p className="text-sm text-white/85">
        {renew
          ? "El plazo vuelve a contar desde ahora."
          : "Se reservan todas las líneas del pedido o ninguna. La tienda deja de ofrecer esas unidades."}
      </p>
      <div role="group" aria-label="Plazos rápidos" className="flex flex-wrap gap-2">
        {FREEZE_PRESETS.map((preset) => (
          <button
            key={preset.hours}
            type="button"
            aria-pressed={hours === preset.hours}
            onClick={() => setHours(preset.hours)}
            className={chipClass(hours === preset.hours)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className={labelClass}>
        Plazo en horas (1 a {MAX_FREEZE_HOURS})
        <NumberInput label="Plazo en horas" value={hours} max={MAX_FREEZE_HOURS} onChange={setHours} />
      </label>
      <Footer
        confirmLabel={renew ? "Renovar" : "Congelar"}
        disabled={!valid}
        onClose={onClose}
        onConfirm={() => valid && onConfirm(hours)}
      />
    </Modal>
  );
}

export type SaleForm = { method: PaymentMethod; note: string; proofPath: string | null };

export function SellDialog({
  orderId,
  total,
  currency,
  onClose,
  onConfirm,
}: {
  orderId: string;
  total: number;
  currency: CatalogCurrency;
  onClose: () => void;
  onConfirm: (payment: SaleForm) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const closed = useRef(false);

  function close() {
    closed.current = true;
    onClose();
  }

  async function confirm() {
    if (!method || uploading) return;
    let proofPath: string | null = null;
    if (file && method !== "efectivo") {
      setUploading(true);
      try {
        proofPath = await uploadProof(orderId, file);
      } catch (cause) {
        // La venta no depende del comprobante: se puede confirmar sin él y adjuntarlo después.
        setError(
          `${cause instanceof Error ? cause.message : "No se pudo subir."} Puedes vender sin el comprobante y adjuntarlo después.`,
        );
        setFile(null);
        return;
      } finally {
        setUploading(false);
      }
    }
    if (!closed.current) onConfirm({ method, note, proofPath });
  }

  return (
    <Modal title="Vender pedido" onClose={close}>
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span>Total</span>
        <strong className="text-xl">{formatPrice(total, currency)}</strong>
      </p>
      <label className={labelClass}>
        Método de pago
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod | "")}
          className={inputClass}
        >
          <option value="" className="bg-theme-navy">
            Elige un método
          </option>
          {PAYMENT_METHODS.map((item) => (
            <option key={item} value={item} className="bg-theme-navy">
              {PAYMENT_LABELS[item]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Nota del pago (opcional)
        <input
          value={note}
          maxLength={MAX_PAYMENT_NOTE}
          onChange={(event) => setNote(event.target.value)}
          className={inputClass}
        />
      </label>
      {method !== "" && method !== "efectivo" && (
        <label className={labelClass}>
          Comprobante (opcional, PNG, JPG o WebP de hasta 5 MB)
          <input
            key={error}
            type="file"
            accept={PROOF_TYPES.join(",")}
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              const problem = picked ? proofProblem(picked) : null;
              if (problem) event.target.value = "";
              setError(problem ?? "");
              setFile(problem ? null : picked);
            }}
            className={fileInput}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-[#ff5a63]">
          {error}
        </p>
      )}
      <p className="text-xs text-white/70">
        Al confirmar se descuentan las unidades del stock.
      </p>
      <Footer
        confirmLabel={uploading ? "Subiendo…" : "Confirmar venta"}
        disabled={!method || uploading}
        onClose={close}
        onConfirm={confirm}
      />
    </Modal>
  );
}

export function VoidDialog({
  missing,
  onClose,
  onConfirm,
}: {
  missing: OrderLine[]; // líneas cuya combinación ya no existe: no se restauran
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Anular venta" onClose={onClose}>
      <p className="text-sm text-white/85">
        Las unidades vuelven al stock. La anulación no se puede deshacer.
      </p>
      {missing.length > 0 && (
        <div className="rounded-xl border border-theme-red/50 bg-theme-red/10 p-3 text-[13px]">
          <strong>Estas líneas ya no existen en el catálogo y no se devolverán al stock:</strong>
          <ul className="mt-1.5 flex flex-col gap-1">
            {missing.map((line, index) => (
              <li key={index} className="break-words">
                {line.qty} × {line.productName} — {line.designName} · {line.color} · {line.size}
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className={labelClass}>
        Motivo (obligatorio)
        <textarea
          value={reason}
          rows={3}
          maxLength={MAX_VOID_REASON}
          onChange={(event) => setReason(event.target.value)}
          className={`${inputClass} !h-auto py-2.5 text-sm`}
        />
      </label>
      <Footer
        confirmLabel="Anular venta"
        disabled={!reason.trim()}
        onClose={onClose}
        onConfirm={() => onConfirm(reason)}
      />
    </Modal>
  );
}

// La URL firmada caduca a los 60 segundos: solo vive mientras el diálogo está abierto.
export function ProofDialog({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Modal title="Comprobante de pago" onClose={onClose}>
      <Image
        src={url}
        alt="Comprobante de pago"
        width={600}
        height={800}
        unoptimized
        className="h-auto max-h-[60dvh] w-full rounded-xl object-contain"
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <a href={url} target="_blank" rel="noreferrer" className={ghostButton}>
          Abrir en otra pestaña
        </a>
        <button type="button" onClick={onClose} className={primaryButton}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
