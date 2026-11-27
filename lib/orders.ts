import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readProducts } from "@/lib/catalog";
import type { CatalogCurrency } from "@/lib/catalog-shared";
import { ORDERS_PAGE_SIZE, PROOF_URL_SECONDS, REQUEST_TTL_DAYS } from "@/lib/content-limits";
import {
  REQUEST_CODE_ALPHABET,
  comboKey,
  normalizeSearch,
  type DisplayStatus,
  type LineCombo,
  type Order,
  type OrderBundle,
  type OrderEvent,
  type OrderLine,
  type OrderRequest,
  type OrderStatus,
  type OrderSummary,
  type PaymentMethod,
  type PickerData,
  type PickerProduct,
  type RequestLine,
  type RequestStatus,
  type RestoreLine,
  type Shortage,
  type StockMap,
} from "@/lib/orders-shared";
import {
  isOrderId,
  isRequestCode,
  proofFileName,
  validateHours,
  validateOrder,
  validatePayment,
  validateProofUpload,
  validateRequestLines,
  validateVoidReason,
} from "@/lib/orders-validate";
import { catalogImageUrl, PROOF_BUCKET, requireSupabase } from "@/lib/supabase";

// =====================================================================================================
// SPEC 17 — Capa de datos de pedidos. Las reglas y la atomicidad viven en las funciones de Postgres
// (0002_orders.sql); aquí se valida la entrada, se llaman y se traducen sus errores.
// No se registran datos de clientes ni rutas de comprobantes en los logs.
// =====================================================================================================

export type Actor = { sub: string; name: string };

export type OrderWriteResult =
  | { ok: true; version: number; notRestored?: RestoreLine[] }
  | { ok: false; error: string; shortages?: Shortage[] };

export const ORDER_CONFLICT_MESSAGE =
  "Este pedido cambió desde que lo abriste. Recarga para ver la versión nueva.";

const GENERIC = "No se pudo guardar. Intenta de nuevo.";

const ERRORS: Record<string, string> = {
  conflict: ORDER_CONFLICT_MESSAGE,
  not_found: "El pedido no existe.",
  not_open: "Solo se puede modificar un pedido abierto.",
  not_frozen: "El pedido no está congelado.",
  not_sold: "El pedido no tiene una venta vigente.",
  request_unavailable: "La solicitud ya no está pendiente: se convirtió, se descartó o venció.",
  invalid_line: "Una de las líneas nuevas ya no existe en el catálogo.",
  duplicate_line: "Hay dos líneas con la misma combinación.",
  invalid_discount: "El descuento no puede ser mayor que el subtotal.",
  invalid_value: "Hay datos inválidos en el pedido.",
  invalid_hours: "El plazo debe estar entre 1 y 720 horas.",
  missing_customer: "Para vender faltan el nombre y el teléfono del cliente.",
  missing_price: "Para vender, todas las líneas necesitan precio.",
  invalid_payment: "Elige un método de pago válido.",
  invalid_proof: "El comprobante no es válido para este pedido.",
  invalid_reason: "Escribe el motivo de la anulación.",
  insufficient_stock: "No hay unidades suficientes. No se cambió nada.",
  missing_lines: "Hay líneas que ya no existen en el catálogo. Quítalas o cámbialas.",
};

type RpcShortage = Shortage & { productId: string; designId: string; missing: boolean };

type RpcResult = {
  ok: boolean;
  error?: string;
  version?: number;
  shortages?: RpcShortage[];
  notRestored?: RestoreLine[];
  previousPath?: string | null;
};

async function callRpc(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(name, args);
  if (error || typeof data !== "object" || data === null) {
    console.error(`[orders] rpc_error fn=${name} code=${error?.code ?? "?"}`);
    throw new Error(GENERIC);
  }
  return data as RpcResult;
}

function toResult(result: RpcResult): OrderWriteResult {
  if (result.ok) {
    return { ok: true, version: result.version ?? 0, notRestored: result.notRestored };
  }
  return {
    ok: false,
    error: ERRORS[result.error ?? ""] ?? GENERIC,
    shortages: result.shortages?.map((item) => ({
      productName: item.productName,
      designName: item.designName,
      color: item.color,
      size: item.size,
      requested: item.requested,
      available: item.available,
    })),
  };
}

function check(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`No se pudo leer ${what}.`);
}

// ---- Lecturas ----

type OrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  frozen_until: string | null;
  request_code: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  note: string;
  currency: CatalogCurrency;
  discount: number;
  shipping: number;
  payment_method: PaymentMethod | null;
  payment_note: string;
  proof_path: string | null;
  sold_at: string | null;
  sold_by_name: string | null;
  void_reason: string | null;
  voided_at: string | null;
  version: number;
  created_at: string;
};

type ItemRow = {
  product_id: string;
  design_id: string;
  color_name: string;
  size: string;
  qty: number;
  unit_price: number | null;
  product_name: string;
  design_name: string;
  image_path: string;
};

type EventRow = {
  id: number;
  type: OrderEvent["type"];
  actor_name: string;
  detail: OrderEvent["detail"];
  created_at: string;
};

// Stock físico y disponible de los productos, sin contar las reservas de `excludingOrderId`.
async function readComboStock(
  supabase: SupabaseClient,
  ids: string[],
  excludingOrderId: string | null,
): Promise<StockMap> {
  const stock: StockMap = {};
  // Un producto puede tener hasta 1000 celdas y PostgREST devuelve máximo 1000 filas: una consulta
  // por producto.
  await Promise.all(
    ids.map(async (id) => {
      const result = await supabase.rpc("combo_stock", {
        ids: [id],
        excluding_order_id: excludingOrderId,
      });
      check(result, "el stock");
      for (const row of (result.data ?? []) as {
        product_id: string;
        design_id: string;
        color_name: string;
        size: string;
        physical: number;
        reserved: number;
      }[]) {
        stock[
          comboKey({
            productId: row.product_id,
            designId: row.design_id,
            color: row.color_name,
            size: row.size,
          })
        ] = { physical: row.physical, available: Math.max(row.physical - row.reserved, 0) };
      }
    }),
  );
  return stock;
}

// Productos (también ocultos) con su stock físico y disponible, para el editor de pedidos.
export async function readPickerProducts(
  ids: string[],
  excludingOrderId: string | null,
): Promise<{ products: Record<string, PickerProduct>; stock: StockMap }> {
  const unique = [...new Set(ids)];
  const supabase = requireSupabase();
  const [found, stock] = await Promise.all([
    readProducts(unique, false),
    readComboStock(supabase, unique, excludingOrderId),
  ]);
  return {
    products: Object.fromEntries(
      found.map(({ product }) => [
        product.id,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          visible: product.visible,
          designs: product.designs.map(({ id, name, image, colors, stock: cells }) => ({
            id,
            name,
            image,
            colors,
            stock: cells,
          })),
        },
      ]),
    ),
    stock,
  };
}

export async function readPickerProduct(
  productId: string,
  excludingOrderId: string | null,
): Promise<PickerData | null> {
  const { products, stock } = await readPickerProducts([productId], excludingOrderId);
  const product = products[productId];
  return product ? { product, stock } : null;
}

export async function readOrder(id: string): Promise<OrderBundle | null> {
  if (!isOrderId(id)) return null;
  const supabase = requireSupabase();
  const [orderResult, itemsResult, eventsResult] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("order_items").select("*").eq("order_id", id).order("position"),
    supabase.from("order_events").select("id,type,actor_name,detail,created_at").eq("order_id", id).order("id"),
  ]);
  check(orderResult, "el pedido");
  check(itemsResult, "las líneas del pedido");
  check(eventsResult, "el historial");
  const row = orderResult.data as OrderRow | null;
  if (!row) return null;

  const lines: OrderLine[] = ((itemsResult.data ?? []) as ItemRow[]).map((item) => ({
    productId: item.product_id,
    designId: item.design_id,
    color: item.color_name,
    size: item.size,
    qty: item.qty,
    unitPrice: item.unit_price,
    productName: item.product_name,
    designName: item.design_name,
    image: catalogImageUrl(item.image_path),
  }));
  const picker = await readPickerProducts(
    lines.map((line) => line.productId),
    id,
  );

  const order: Order = {
    id: row.id,
    number: row.number,
    status: row.status,
    frozenUntil: row.frozen_until,
    requestCode: row.request_code,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    note: row.note,
    currency: row.currency,
    discount: row.discount,
    shipping: row.shipping,
    paymentMethod: row.payment_method,
    paymentNote: row.payment_note,
    hasProof: row.proof_path !== null,
    soldAt: row.sold_at,
    soldByName: row.sold_by_name,
    voidReason: row.void_reason,
    voidedAt: row.voided_at,
    version: row.version,
    createdAt: row.created_at,
    lines,
  };
  const events = ((eventsResult.data ?? []) as EventRow[]).map((event) => ({
    id: event.id,
    type: event.type,
    actorName: event.actor_name,
    detail: event.detail,
    createdAt: event.created_at,
  }));
  return { order, events, ...picker };
}

export async function readOrderList(query: {
  status: DisplayStatus | "";
  search: string;
  page: number;
}): Promise<{ orders: OrderSummary[]; total: number }> {
  const supabase = requireSupabase();
  const result = await supabase.rpc("order_list", {
    status_filter: query.status,
    search: normalizeSearch(query.search),
    page_limit: ORDERS_PAGE_SIZE,
    page_offset: (query.page - 1) * ORDERS_PAGE_SIZE,
  });
  check(result, "los pedidos");
  const rows = (result.data ?? []) as {
    id: string;
    number: number;
    status: OrderStatus;
    frozen_until: string | null;
    request_code: string | null;
    customer_name: string;
    currency: CatalogCurrency;
    total: number;
    created_at: string;
    total_count: number;
  }[];
  return {
    total: rows[0]?.total_count ?? 0,
    orders: rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      frozenUntil: row.frozen_until,
      requestCode: row.request_code,
      customerName: row.customer_name,
      currency: row.currency,
      total: row.total,
      createdAt: row.created_at,
    })),
  };
}

type RequestRow = {
  code: string;
  lines: RequestLine[];
  currency: CatalogCurrency;
  status: RequestStatus;
  order_id: string | null;
  created_at: string;
};

function toRequest(row: RequestRow): OrderRequest {
  return {
    code: row.code,
    lines: row.lines,
    currency: row.currency,
    status: row.status,
    orderId: row.order_id,
    createdAt: row.created_at,
  };
}

async function purgeRequests(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - REQUEST_TTL_DAYS * 86_400_000).toISOString();
  await supabase.from("order_requests").delete().lt("created_at", cutoff);
}

export async function readRequests(query: {
  status: RequestStatus | "";
  search: string;
  page: number;
}): Promise<{ requests: OrderRequest[]; total: number }> {
  const supabase = requireSupabase();
  await purgeRequests(supabase);
  let select = supabase.from("order_requests").select("*", { count: "exact" });
  if (query.status) select = select.eq("status", query.status);
  // El código solo usa letras, números y guion: se quita lo demás para no inyectar comodines.
  const search = query.search.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
  if (search) select = select.ilike("code", `%${search}%`);
  const from = (query.page - 1) * ORDERS_PAGE_SIZE;
  const result = await select
    .order("created_at", { ascending: false })
    .range(from, from + ORDERS_PAGE_SIZE - 1);
  // Pedir una página que ya no existe (se descartó la última de la lista) no es un fallo.
  if (result.error?.code === "PGRST103") return { requests: [], total: result.count ?? 0 };
  check(result, "las solicitudes");
  return {
    total: result.count ?? 0,
    requests: ((result.data ?? []) as RequestRow[]).map(toRequest),
  };
}

export async function readRequest(code: string): Promise<OrderRequest | null> {
  if (!isRequestCode(code)) return null;
  const supabase = requireSupabase();
  await purgeRequests(supabase);
  const result = await supabase.from("order_requests").select("*").eq("code", code).maybeSingle();
  check(result, "la solicitud");
  return result.data ? toRequest(result.data as RequestRow) : null;
}

// Borrador de pedido a partir de una solicitud: copia el precio actual del catálogo y separa las
// combinaciones que ya no existen. No escribe nada.
export async function draftFromRequest(request: OrderRequest): Promise<{
  lines: OrderLine[];
  excluded: RequestLine[];
  products: Record<string, PickerProduct>;
  stock: StockMap;
}> {
  const picker = await readPickerProducts(
    request.lines.map((line) => line.productId),
    null,
  );
  const lines: OrderLine[] = [];
  const excluded: RequestLine[] = [];
  for (const line of request.lines) {
    const product = picker.products[line.productId];
    const design = product?.designs.find((item) => item.id === line.designId);
    if (!product || !design || !picker.stock[comboKey(line)]) {
      excluded.push(line);
      continue;
    }
    lines.push({
      productId: line.productId,
      designId: line.designId,
      color: line.color,
      size: line.size,
      qty: line.qty,
      unitPrice: product.price,
      productName: product.name,
      designName: design.name,
      image: design.image,
    });
  }
  return { lines, excluded, ...picker };
}

// ---- Escrituras ----

export async function writeOrder(
  input: unknown,
  expectedVersion: number | null,
  actor: Actor,
): Promise<OrderWriteResult & { id?: string }> {
  const checked = validateOrder(input);
  if (!checked.ok) return checked;
  const result = await callRpc(requireSupabase(), "save_order", {
    payload: checked.value,
    expected_version: expectedVersion,
    actor,
  });
  return { ...toResult(result), id: checked.value.id };
}

async function orderRpc(
  name: string,
  id: string,
  expectedVersion: number,
  actor: Actor,
  extra: Record<string, unknown> = {},
): Promise<OrderWriteResult> {
  if (!isOrderId(id) || !Number.isInteger(expectedVersion)) {
    return { ok: false, error: "Pedido inválido." };
  }
  return toResult(
    await callRpc(requireSupabase(), name, {
      id,
      expected_version: expectedVersion,
      actor,
      ...extra,
    }),
  );
}

export async function writeFreeze(
  id: string,
  hours: unknown,
  expectedVersion: number,
  actor: Actor,
): Promise<OrderWriteResult> {
  const checked = validateHours(hours);
  if (!checked.ok) return checked;
  return orderRpc("freeze_order", id, expectedVersion, actor, { hours: checked.value });
}

export async function writeRelease(id: string, expectedVersion: number, actor: Actor) {
  return orderRpc("release_order", id, expectedVersion, actor);
}

export async function writeCancel(id: string, expectedVersion: number, actor: Actor) {
  return orderRpc("cancel_order", id, expectedVersion, actor);
}

export async function writeSale(
  id: string,
  payment: unknown,
  expectedVersion: number,
  actor: Actor,
): Promise<OrderWriteResult> {
  const checked = validatePayment(payment);
  if (!checked.ok) return checked;
  const { proofPath } = checked.value;
  if (proofPath && !(await proofExists(id, proofPath))) {
    return { ok: false, error: "El comprobante no llegó a subirse. Intenta de nuevo." };
  }
  return orderRpc("sell_order", id, expectedVersion, actor, { payment: checked.value });
}

export async function writeVoid(
  id: string,
  reason: unknown,
  expectedVersion: number,
  actor: Actor,
): Promise<OrderWriteResult> {
  const checked = validateVoidReason(reason);
  if (!checked.ok) return checked;
  return orderRpc("void_order", id, expectedVersion, actor, { reason: checked.value });
}

export async function writeProof(
  id: string,
  path: unknown,
  expectedVersion: number,
  actor: Actor,
): Promise<OrderWriteResult> {
  if (!isOrderId(id) || !Number.isInteger(expectedVersion)) {
    return { ok: false, error: "Pedido inválido." };
  }
  if (typeof path !== "string" || !(await proofExists(id, path))) {
    return { ok: false, error: "El comprobante no llegó a subirse. Intenta de nuevo." };
  }
  const supabase = requireSupabase();
  const result = await callRpc(supabase, "set_order_proof", {
    id,
    path,
    expected_version: expectedVersion,
    actor,
  });
  if (result.ok && result.previousPath && result.previousPath !== path) {
    // Un archivo huérfano no debe romper el guardado.
    await supabase.storage.from(PROOF_BUCKET).remove([result.previousPath]).catch(() => undefined);
  }
  return toResult(result);
}

// ---- Comprobantes ----

async function proofExists(orderId: string, path: string): Promise<boolean> {
  const file = proofFileName(orderId, path);
  if (!file) return false;
  const { data, error } = await requireSupabase()
    .storage.from(PROOF_BUCKET)
    .list(`proofs/${orderId}`, { search: file, limit: 1 });
  return !error && (data ?? []).some((item) => item.name === file);
}

export type ProofUpload =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

// URL firmada de subida; la ruta (`proofs/<orderId>/<uuid>.<ext>`) la genera el servidor.
export async function createProofUpload(input: unknown): Promise<ProofUpload> {
  const checked = validateProofUpload(input);
  if (!checked.ok) return { ...checked, status: 400 };
  const { orderId, extension } = checked.value;
  const supabase = requireSupabase();
  const found = await supabase
    .from("orders")
    .select("status,payment_method")
    .eq("id", orderId)
    .maybeSingle();
  if (found.error) return { ok: false, status: 500, error: "No se pudo preparar la subida." };
  const order = found.data as { status: OrderStatus; payment_method: PaymentMethod | null } | null;
  if (!order) return { ok: false, status: 404, error: ERRORS.not_found };
  // Abierto: se adjunta al vender. Vendido: se adjunta o reemplaza después, salvo en efectivo.
  const allowed =
    order.status === "abierto" ||
    (order.status === "vendido" && order.payment_method !== "efectivo");
  if (!allowed) {
    return { ok: false, status: 409, error: "Este pedido no admite comprobante." };
  }
  const path = `proofs/${orderId}/${randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, status: 500, error: "No se pudo preparar la subida." };
  return { ok: true, path, signedUrl: data.signedUrl };
}

// URL firmada de descarga que caduca a los 60 s. No se guarda ni se cachea.
export async function createProofUrl(
  orderId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isOrderId(orderId)) return { ok: false, error: "Pedido inválido." };
  const supabase = requireSupabase();
  const found = await supabase.from("orders").select("proof_path").eq("id", orderId).maybeSingle();
  const path = (found.data as { proof_path: string | null } | null)?.proof_path;
  if (!path) return { ok: false, error: "El pedido no tiene comprobante." };
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(path, PROOF_URL_SECONDS);
  if (error || !data) return { ok: false, error: "No se pudo abrir el comprobante." };
  return { ok: true, url: data.signedUrl };
}

// ---- Solicitudes ----

export async function writeDiscardRequest(
  code: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRequestCode(code)) return { ok: false, error: "Código inválido." };
  const result = await callRpc(requireSupabase(), "discard_order_request", { code });
  return result.ok ? { ok: true } : { ok: false, error: ERRORS.request_unavailable };
}

function newRequestCode(): string {
  const chars = Array.from(
    { length: 5 },
    () => REQUEST_CODE_ALPHABET[randomInt(REQUEST_CODE_ALPHABET.length)],
  );
  return `OC-${chars.join("")}`;
}

const CODE_ATTEMPTS = 5;

// Guarda la bolsa como solicitud y devuelve su código, o null si no es válida o no se pudo.
// Solo productos visibles y combinaciones existentes; nombres, precios y moneda salen del catálogo.
// No toca el stock.
export async function createRequestFromCart(input: unknown): Promise<string | null> {
  const checked = validateRequestLines(input);
  if (!checked.ok) return null;
  const supabase = requireSupabase();
  const ids = [...new Set(checked.value.map((line) => line.productId))];
  const [found, settings] = await Promise.all([
    readProducts(ids, true),
    supabase.from("catalog_settings").select("currency").eq("id", 1).maybeSingle(),
  ]);
  if (settings.error) return requestRejected("settings_error");
  const byId = new Map(found.map(({ product }) => [product.id, product]));

  const lines: RequestLine[] = [];
  for (const line of checked.value) {
    const product = byId.get(line.productId);
    const design = product?.designs.find((item) => item.id === line.designId);
    if (!product || !design || !existsIn(design, line)) return requestRejected("unavailable_line");
    lines.push({
      ...line,
      productName: product.name,
      designName: design.name,
      unitPrice: product.price,
    });
  }
  const currency = (settings.data as { currency: CatalogCurrency } | null)?.currency ?? "COP";

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = newRequestCode();
    const result = await callRpc(supabase, "create_order_request", {
      payload: { code, currency, lines },
    });
    if (result.ok) return code;
    if (result.error !== "code_taken") return requestRejected(result.error ?? "rpc_rejected");
  }
  return requestRejected("code_taken");
}

function requestRejected(reason: string): null {
  console.warn(`[orders] request_skipped reason=${reason}`);
  return null;
}

function existsIn(
  design: { colors: string[]; stock: Record<string, Record<string, number>> },
  line: LineCombo,
): boolean {
  return (
    design.colors.includes(line.color) &&
    Object.prototype.hasOwnProperty.call(design.stock[line.color] ?? {}, line.size)
  );
}
