"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ConfirmDialog,
  focusRing,
  ghostButton,
  inputClass,
  labelClass,
  panel,
  primaryButton,
  softButton,
  Toast,
  useToast,
} from "@/app/admin/_components/ui";
import LinePicker, { type CatalogOption } from "@/app/admin/pedidos/_components/line-picker";
import NumberInput from "@/app/admin/pedidos/_components/money-input";
import {
  FreezeDialog,
  ProofDialog,
  SellDialog,
  VoidDialog,
  type SaleForm,
} from "@/app/admin/pedidos/_components/order-dialogs";
import OrderHistory from "@/app/admin/pedidos/_components/order-history";
import OrderLines from "@/app/admin/pedidos/_components/order-lines";
import { proofProblem, uploadProof } from "@/app/admin/pedidos/_components/proof-upload";
import StatusBadge from "@/app/admin/pedidos/_components/status-badge";
import {
  cancelOrder,
  freezeOrder,
  getProofUrl,
  releaseOrder,
  saveOrder,
  sellOrder,
  setOrderProof,
  voidOrder,
  type OrderResult,
} from "@/app/admin/pedidos/actions";
import { formatPrice, type CatalogCurrency } from "@/lib/catalog-shared";
import {
  MAX_CUSTOMER_ADDRESS,
  MAX_CUSTOMER_NAME,
  MAX_CUSTOMER_PHONE,
  MAX_ORDER_LINES,
  MAX_ORDER_NOTE,
  MAX_PRICE,
  MAX_STOCK,
  PROOF_TYPES,
} from "@/lib/content-limits";
import {
  PAYMENT_LABELS,
  comboKey,
  displayStatus,
  formatDateTime,
  formatOrderNumber,
  mergeLines,
  orderSubtotal,
  orderTotal,
  type OrderBundle,
  type OrderDraft,
  type OrderLine,
  type PickerData,
  type PickerProduct,
  type RequestLine,
  type Shortage,
  type StockMap,
} from "@/lib/orders-shared";

type Catalog = {
  currency: CatalogCurrency;
  freeShippingFrom: number | null;
  products: CatalogOption[];
};

type FromRequest = {
  code: string;
  lines: OrderLine[];
  excluded: RequestLine[];
  products: Record<string, PickerProduct>;
  stock: StockMap;
};

type Dialog = "freeze" | "sell" | "void" | "cancel" | "leave" | null;

type Problem = { message: string; shortages?: Shortage[] } | null;

function emptyDraft(lines: OrderLine[] = []): OrderDraft {
  return {
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    note: "",
    discount: 0,
    shipping: 0,
    lines,
  };
}

function toDraft(bundle: OrderBundle): OrderDraft {
  const { customerName, customerPhone, customerAddress, note, discount, shipping, lines } =
    bundle.order;
  return { customerName, customerPhone, customerAddress, note, discount, shipping, lines };
}

// Solo lo que el navegador envía: así las copias para mostrar no cuentan como cambios.
function toInput(draft: OrderDraft) {
  return {
    ...draft,
    lines: draft.lines.map(({ productId, designId, color, size, qty, unitPrice }) => ({
      productId,
      designId,
      color,
      size,
      qty,
      unitPrice,
    })),
  };
}

export default function OrderEditor({
  initial,
  fromRequest,
  catalog,
  canVoid,
  serverNow,
  unavailable = null,
}: {
  initial: OrderBundle | null; // null = pedido nuevo
  fromRequest: FromRequest | null;
  catalog: Catalog;
  canVoid: boolean;
  serverNow: number;
  // Solicitud que no se puede convertir (solo en el pedido nuevo).
  unavailable?: { message: string; orderId: string | null } | null;
}) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [draft, setDraft] = useState<OrderDraft>(() =>
    initial ? toDraft(initial) : emptyDraft(fromRequest?.lines),
  );
  const [products, setProducts] = useState(initial?.products ?? fromRequest?.products ?? {});
  const [stock, setStock] = useState<StockMap>(initial?.stock ?? fromRequest?.stock ?? {});
  // El id de un pedido nuevo se genera una vez: repetir el guardado no crea dos.
  const [newId] = useState(() => crypto.randomUUID());
  const [now, setNow] = useState(serverNow);
  const [problem, setProblem] = useState<Problem>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const problemRef = useRef<HTMLDivElement>(null);

  const order = bundle?.order ?? null;
  const id = order?.id ?? newId;
  const editable = !order || order.status === "abierto";
  const currency = order?.currency ?? catalog.currency;
  const requestCode = order?.requestCode ?? fromRequest?.code ?? null;
  const status = order ? displayStatus(order, now) : null;
  const dirty = bundle
    ? JSON.stringify(toInput(draft)) !== JSON.stringify(toInput(toDraft(bundle)))
    : fromRequest !== null || JSON.stringify(draft) !== JSON.stringify(emptyDraft());
  const subtotal = orderSubtotal(draft.lines);
  const total = orderTotal(draft.lines, draft);
  const unpriced = draft.lines.some((line) => line.unitPrice === null);
  const locked = busy || uploading;
  const missingLines = draft.lines.filter((line) => !stock[comboKey(line)]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Refresca "vence en…" mientras la pantalla está abierta.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (problem) problemRef.current?.scrollIntoView({ block: "center" });
  }, [problem]);

  function patch(next: Partial<OrderDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function changeLine(index: number, next: OrderLine | null) {
    setDraft((current) => {
      const lines = current.lines.slice();
      if (next) lines[index] = next;
      else lines.splice(index, 1);
      // Si el cambio la deja igual a otra línea, se suman las cantidades.
      return { ...current, lines: mergeLines(lines, MAX_STOCK) };
    });
  }

  function addLine(line: OrderLine, data: PickerData) {
    const exists = draft.lines.some((item) => comboKey(item) === comboKey(line));
    if (!exists && draft.lines.length >= MAX_ORDER_LINES) {
      return show(`Un pedido admite hasta ${MAX_ORDER_LINES} líneas.`);
    }
    setProducts((current) => ({ ...current, [data.product.id]: data.product }));
    setStock((current) => ({ ...current, ...data.stock }));
    setDraft((current) => ({ ...current, lines: mergeLines([...current.lines, line], MAX_STOCK) }));
    show(exists ? "Se sumó la cantidad a la línea que ya estaba" : "Línea agregada");
  }

  // Ejecuta una acción del servidor. Si falla, el borrador queda en pantalla.
  function run(action: () => Promise<OrderResult>, message: string) {
    setDialog(null);
    setProblem(null);
    startTransition(async () => {
      let result: OrderResult;
      try {
        result = await action();
      } catch {
        setProblem({ message: "No se pudo completar la acción. Revisa tu conexión." });
        return;
      }
      if (!result.ok) {
        setProblem({ message: result.error, shortages: result.shortages });
        return;
      }
      setBundle(result.bundle);
      setDraft(toDraft(result.bundle));
      setProducts(result.bundle.products);
      setStock(result.bundle.stock);
      setNow(Date.now());
      // Un pedido recién creado pasa a su propia ruta.
      if (!order) router.replace(`/admin/pedidos/${result.bundle.order.id}`);
      show(
        result.notRestored?.length
          ? `${message}. Algunas líneas no volvieron al stock: revisa el historial.`
          : message,
      );
    });
  }

  function save() {
    if (draft.lines.length === 0) return show("Agrega al menos una línea.");
    if (draft.lines.some((line) => line.qty < 1)) return show("Revisa las cantidades.");
    if (draft.discount > subtotal) return show("El descuento no puede ser mayor que el subtotal.");
    run(
      () => saveOrder({ ...toInput(draft), id, requestCode }, order?.version ?? null),
      order ? "Cambios guardados" : "Pedido creado",
    );
  }

  function discard() {
    if (!bundle) return router.push("/admin/pedidos");
    setDraft(toDraft(bundle));
    setProducts(bundle.products);
    setStock(bundle.stock);
    setProblem(null);
    show("Cambios descartados");
  }

  async function attachProof(file: File) {
    if (!order) return;
    const invalid = proofProblem(file);
    if (invalid) return setProblem({ message: invalid });
    setUploading(true);
    try {
      const path = await uploadProof(order.id, file);
      run(() => setOrderProof(order.id, path, order.version), "Comprobante guardado");
    } catch (cause) {
      setProblem({ message: cause instanceof Error ? cause.message : "No se pudo subir." });
    } finally {
      setUploading(false);
    }
  }

  function viewProof() {
    if (!order) return;
    startTransition(async () => {
      const result = await getProofUrl(order.id);
      if (result.ok) setProofUrl(result.url);
      else setProblem({ message: result.error });
    });
  }

  if (!bundle && unavailable && !busy) {
    return (
      <div className="flex max-w-md flex-col items-start gap-3 text-sm">
        <p>{unavailable.message}</p>
        <Link
          href={
            unavailable.orderId
              ? `/admin/pedidos/${unavailable.orderId}`
              : "/admin/pedidos?tab=solicitudes"
          }
          className={softButton}
        >
          {unavailable.orderId ? "Ver el pedido" : "Volver a las solicitudes"}
        </Link>
      </div>
    );
  }

  const title = order ? `Pedido ${formatOrderNumber(order.number)}` : "Pedido nuevo";

  return (
    <>
      <div className="sticky top-[62px] z-20 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border-soft bg-theme-navy/85 px-3 py-2.5 backdrop-blur-[14px] min-[900px]:top-3">
        <button
          type="button"
          aria-label="Volver a pedidos"
          onClick={() => (dirty ? setDialog("leave") : router.push("/admin/pedidos"))}
          className={`inline-flex size-[38px] shrink-0 items-center justify-center rounded-full border border-white/15 hover:border-theme-red ${focusRing}`}
        >
          ←
        </button>
        <div className="min-w-[120px] flex-1">
          <h1 className="truncate text-base font-bold">{title}</h1>
          {editable && (
            <div className={`text-xs ${dirty ? "text-[#ff5a63]" : "text-white/65"}`}>
              {busy ? "Procesando…" : dirty ? "Cambios sin guardar" : order ? "Todo guardado" : ""}
            </div>
          )}
        </div>
        {order && <StatusBadge order={order} now={now} />}
        {editable && dirty && (
          <button
            type="button"
            onClick={discard}
            disabled={locked}
            className={`${ghostButton} !h-[38px] !px-3.5 !text-[13px]`}
          >
            Descartar
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={!dirty || locked}
            className={`${primaryButton} !h-[38px] !px-[18px] !text-[13px]`}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        )}
      </div>

      {problem && (
        <div
          ref={problemRef}
          role="alert"
          className="flex flex-col gap-2 rounded-2xl border border-theme-red bg-theme-red/15 p-4 text-sm"
        >
          <strong>{problem.message}</strong>
          {problem.shortages && (
            <ul className="flex flex-col gap-1">
              {problem.shortages.map((item, index) => (
                <li key={index} className="break-words">
                  {item.productName} — {item.designName} · {item.color} · {item.size}: pediste{" "}
                  {item.requested}, disponible {item.available}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {requestCode && (
        <p className="text-[13px] text-white/75">
          Solicitud <strong>{requestCode}</strong>
          {!order && " — el pedido se crea al pulsar Guardar."}
        </p>
      )}
      {!order && fromRequest && fromRequest.excluded.length > 0 && (
        <div className="rounded-2xl border border-theme-red/60 bg-theme-red/10 p-4 text-sm">
          <strong>Estas líneas ya no existen en el catálogo y no se incluyeron:</strong>
          <ul className="mt-1.5 flex flex-col gap-1">
            {fromRequest.excluded.map((line, index) => (
              <li key={index} className="break-words">
                {line.qty} × {line.productName} — {line.designName} · {line.color} · {line.size}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid items-start gap-4 min-[1200px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={`${panel} flex min-w-0 flex-col gap-3 p-4`}>
          <h2 className="text-[17px] font-bold">Líneas</h2>
          {/* Los campos se bloquean mientras se guarda para que la respuesta no pise cambios. */}
          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-3">
            <OrderLines
              lines={draft.lines}
              products={products}
              stock={stock}
              currency={currency}
              editable={editable}
              onChange={changeLine}
            />
            {editable && (
              <LinePicker options={catalog.products} orderId={order?.id ?? null} onAdd={addLine} />
            )}
          </fieldset>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section className={`${panel} flex flex-col gap-2.5 p-4`}>
            <h2 className="text-[17px] font-bold">Totales</h2>
            <p className="flex justify-between gap-2 text-sm">
              <span>Subtotal</span>
              <strong>{formatPrice(subtotal, currency)}</strong>
            </p>
            {unpriced && (
              <p className="text-xs text-white/65">Sin contar las líneas sin precio.</p>
            )}
            {editable ? (
              <fieldset disabled={locked} className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Descuento
                  <NumberInput
                    label="Descuento"
                    value={draft.discount}
                    max={2_147_483_647}
                    onChange={(value) => patch({ discount: value ?? 0 })}
                  />
                </label>
                <label className={labelClass}>
                  Envío
                  <NumberInput
                    label="Envío"
                    value={draft.shipping}
                    max={MAX_PRICE}
                    onChange={(value) => patch({ shipping: value ?? 0 })}
                  />
                </label>
              </fieldset>
            ) : (
              <>
                <p className="flex justify-between gap-2 text-sm">
                  <span>Descuento</span>
                  <span>− {formatPrice(draft.discount, currency)}</span>
                </p>
                <p className="flex justify-between gap-2 text-sm">
                  <span>Envío</span>
                  <span>{formatPrice(draft.shipping, currency)}</span>
                </p>
              </>
            )}
            {editable && draft.discount > subtotal && (
              <p role="alert" className="text-[13px] text-[#ff5a63]">
                El descuento no puede ser mayor que el subtotal.
              </p>
            )}
            {editable &&
              catalog.freeShippingFrom !== null &&
              subtotal >= catalog.freeShippingFrom && (
                <p className="text-[13px] text-[#ffb0b4]">
                  El subtotal alcanza el envío gratis del catálogo. Tú decides el valor del envío.
                </p>
              )}
            <p className="flex justify-between gap-2 border-t border-white/10 pt-2.5 text-base">
              <span>Total</span>
              <strong>{formatPrice(total, currency)}</strong>
            </p>
          </section>

          <section className={`${panel} flex flex-col gap-3 p-4`}>
            <h2 className="text-[17px] font-bold">Cliente</h2>
            <fieldset disabled={!editable || locked} className="flex min-w-0 flex-col gap-3">
              <label className={labelClass}>
                Nombre
                <input
                  value={draft.customerName}
                  maxLength={MAX_CUSTOMER_NAME}
                  onChange={(event) => patch({ customerName: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Teléfono
                <input
                  type="tel"
                  value={draft.customerPhone}
                  maxLength={MAX_CUSTOMER_PHONE}
                  onChange={(event) => patch({ customerPhone: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Ciudad y dirección
                <input
                  value={draft.customerAddress}
                  maxLength={MAX_CUSTOMER_ADDRESS}
                  onChange={(event) => patch({ customerAddress: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Nota
                <textarea
                  value={draft.note}
                  rows={3}
                  maxLength={MAX_ORDER_NOTE}
                  onChange={(event) => patch({ note: event.target.value })}
                  className={`${inputClass} !h-auto resize-y py-2.5 text-sm`}
                />
              </label>
            </fieldset>
          </section>

          {order && order.status === "abierto" && (
            <section className={`${panel} flex flex-col gap-3 p-4`}>
              <h2 className="text-[17px] font-bold">Inventario y venta</h2>
              {status === "congelado" && order.frozenUntil && (
                <p className="text-sm">
                  Unidades reservadas hasta el <strong>{formatDateTime(order.frozenUntil)}</strong>{" "}
                  (hora de Colombia).
                </p>
              )}
              {status === "vencido" && order.frozenUntil && (
                <p className="text-sm text-[#ffb0b4]">
                  El congelamiento venció el {formatDateTime(order.frozenUntil)}. Las unidades ya no
                  están reservadas.
                </p>
              )}
              {status === "abierto" && (
                <p className="text-sm text-white/75">Este pedido no reserva unidades.</p>
              )}
              {missingLines.length > 0 && (
                <p className="text-[13px] text-[#ff5a63]">
                  Quita o cambia las líneas que ya no existen para congelar o vender.
                </p>
              )}
              {dirty && (
                <p className="text-[13px] text-white/75">
                  Guarda o descarta los cambios para congelar, vender o cancelar.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {status === "congelado" ? (
                  <>
                    <button
                      type="button"
                      disabled={dirty || locked || missingLines.length > 0}
                      onClick={() => setDialog("freeze")}
                      className={softButton}
                    >
                      Renovar
                    </button>
                    <button
                      type="button"
                      disabled={dirty || locked}
                      onClick={() =>
                        run(() => releaseOrder(order.id, order.version), "Unidades liberadas")
                      }
                      className={ghostButton}
                    >
                      Liberar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={dirty || locked || missingLines.length > 0}
                    onClick={() => setDialog("freeze")}
                    className={softButton}
                  >
                    Congelar
                  </button>
                )}
                <button
                  type="button"
                  disabled={dirty || locked || missingLines.length > 0}
                  onClick={() => setDialog("sell")}
                  className={primaryButton}
                >
                  Vender
                </button>
                <button
                  type="button"
                  disabled={dirty || locked}
                  onClick={() => setDialog("cancel")}
                  className={ghostButton}
                >
                  Cancelar pedido
                </button>
              </div>
            </section>
          )}

          {order && (order.status === "vendido" || order.status === "anulado") && (
            <section className={`${panel} flex flex-col gap-3 p-4`}>
              <h2 className="text-[17px] font-bold">Venta</h2>
              <div className="flex flex-col gap-1 text-sm">
                <span>
                  {order.paymentMethod ? PAYMENT_LABELS[order.paymentMethod] : ""}
                  {order.soldAt && ` · ${formatDateTime(order.soldAt)}`}
                  {order.soldByName && ` · ${order.soldByName}`}
                </span>
                {order.paymentNote && (
                  <span className="break-words text-white/75">{order.paymentNote}</span>
                )}
                {order.status === "anulado" && (
                  <span className="break-words text-[#ffb0b4]">
                    Anulada
                    {order.voidedAt && ` el ${formatDateTime(order.voidedAt)}`}: {order.voidReason}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {order.hasProof && (
                  <button type="button" onClick={viewProof} disabled={locked} className={softButton}>
                    Ver comprobante
                  </button>
                )}
                {order.status === "vendido" && order.paymentMethod !== "efectivo" && (
                  <label
                    className={`${ghostButton} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-theme-red ${locked ? "pointer-events-none opacity-45" : ""}`}
                  >
                    {uploading
                      ? "Subiendo…"
                      : order.hasProof
                        ? "Reemplazar comprobante"
                        : "Adjuntar comprobante"}
                    <input
                      type="file"
                      accept={PROOF_TYPES.join(",")}
                      disabled={locked}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void attachProof(file);
                      }}
                      className="sr-only"
                    />
                  </label>
                )}
                {order.status === "vendido" && canVoid && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setDialog("void")}
                    className={ghostButton}
                  >
                    Anular venta
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {bundle && <OrderHistory events={bundle.events} currency={currency} />}
      {order && (
        <Link
          href="/admin/pedidos"
          className={`w-max rounded text-[13px] text-white/75 hover:text-white ${focusRing}`}
        >
          ← Todos los pedidos
        </Link>
      )}

      {dialog === "freeze" && order && (
        <FreezeDialog
          renew={status === "congelado"}
          onClose={() => setDialog(null)}
          onConfirm={(hours) =>
            run(() => freezeOrder(order.id, hours, order.version), "Pedido congelado")
          }
        />
      )}
      {dialog === "sell" && order && (
        <SellDialog
          orderId={order.id}
          total={total}
          currency={currency}
          onClose={() => setDialog(null)}
          onConfirm={(payment: SaleForm) =>
            run(() => sellOrder(order.id, payment, order.version), "Venta registrada")
          }
        />
      )}
      {dialog === "void" && order && (
        <VoidDialog
          missing={missingLines}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            run(() => voidOrder(order.id, reason, order.version), "Venta anulada")
          }
        />
      )}
      {proofUrl && <ProofDialog url={proofUrl} onClose={() => setProofUrl(null)} />}
      <ConfirmDialog
        open={dialog === "cancel"}
        title="Cancelar pedido"
        confirmLabel="Cancelar pedido"
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          order && run(() => cancelOrder(order.id, order.version), "Pedido cancelado")
        }
      >
        <p>El pedido queda cerrado y libera sus reservas. No se puede reabrir.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "leave"}
        title="Cambios sin guardar"
        confirmLabel="Salir igual"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          router.push("/admin/pedidos");
        }}
      >
        <p>Si sales ahora se pierden los cambios de este pedido.</p>
      </ConfirmDialog>
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
