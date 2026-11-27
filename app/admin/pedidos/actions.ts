"use server";

import { updateTag } from "next/cache";
import { getSession, requirePermission } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import {
  createProofUrl,
  readOrder,
  readPickerProduct,
  writeCancel,
  writeDiscardRequest,
  writeFreeze,
  writeOrder,
  writeProof,
  writeRelease,
  writeSale,
  writeVoid,
  type Actor,
  type OrderWriteResult,
} from "@/lib/orders";
import type { OrderBundle, PickerData, RestoreLine, Shortage } from "@/lib/orders-shared";
import { isOrderId } from "@/lib/orders-validate";

type Fail = { ok: false; error: string; shortages?: Shortage[] };

export type OrderResult = { ok: true; bundle: OrderBundle; notRestored?: RestoreLine[] } | Fail;

const GENERIC = "No se pudo completar la acción. Intenta de nuevo.";

// SPEC 17: cada acción exige `pedidos.pedidos.gestionar` (anular, además, `pedidos.ventas.anular`).
async function guarded<T>(
  extra: Permission | null,
  fn: (actor: Actor) => Promise<T | Fail>,
): Promise<T | Fail> {
  const auth = await requirePermission("pedidos.pedidos.gestionar");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (extra) {
    const second = await requirePermission(extra);
    if (!second.ok) return { ok: false, error: second.error };
  }
  const session = await getSession();
  try {
    return await fn({
      sub: auth.session.sub,
      name: session?.name || session?.email || "Usuario",
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : GENERIC };
  }
}

// Tras un cambio devuelve el pedido releído. `touchesStore` invalida la caché del catálogo: se usa
// cuando cambian las reservas o el stock.
async function after(
  id: string,
  write: OrderWriteResult,
  touchesStore: boolean,
): Promise<OrderResult> {
  if (!write.ok) return write;
  if (touchesStore) updateTag("catalog");
  const bundle = await readOrder(id);
  if (!bundle) return { ok: false, error: "El pedido se guardó, pero no se pudo volver a leer. Recarga." };
  return { ok: true, bundle, notRestored: write.notRestored };
}

export async function saveOrder(
  input: unknown,
  expectedVersion: number | null,
): Promise<OrderResult> {
  return guarded(null, async (actor) => {
    if (expectedVersion !== null && !Number.isInteger(expectedVersion)) {
      return { ok: false as const, error: "Versión del pedido inválida." };
    }
    const write = await writeOrder(input, expectedVersion, actor);
    if (!write.ok) return write;
    // Editar un pedido congelado ajusta las reservas; uno sin congelar no las cambia.
    updateTag("catalog");
    return after(write.id ?? "", write, false);
  });
}

export async function freezeOrder(
  id: string,
  hours: number,
  expectedVersion: number,
): Promise<OrderResult> {
  return guarded(null, async (actor) =>
    after(id, await writeFreeze(id, hours, expectedVersion, actor), true),
  );
}

export async function releaseOrder(id: string, expectedVersion: number): Promise<OrderResult> {
  return guarded(null, async (actor) =>
    after(id, await writeRelease(id, expectedVersion, actor), true),
  );
}

export async function cancelOrder(id: string, expectedVersion: number): Promise<OrderResult> {
  return guarded(null, async (actor) =>
    after(id, await writeCancel(id, expectedVersion, actor), true),
  );
}

export async function sellOrder(
  id: string,
  payment: unknown,
  expectedVersion: number,
): Promise<OrderResult> {
  return guarded(null, async (actor) =>
    after(id, await writeSale(id, payment, expectedVersion, actor), true),
  );
}

export async function voidOrder(
  id: string,
  reason: string,
  expectedVersion: number,
): Promise<OrderResult> {
  return guarded("pedidos.ventas.anular", async (actor) =>
    after(id, await writeVoid(id, reason, expectedVersion, actor), true),
  );
}

export async function setOrderProof(
  id: string,
  path: string,
  expectedVersion: number,
): Promise<OrderResult> {
  return guarded(null, async (actor) =>
    after(id, await writeProof(id, path, expectedVersion, actor), false),
  );
}

export async function getProofUrl(id: string): Promise<{ ok: true; url: string } | Fail> {
  return guarded(null, async () => createProofUrl(id));
}

// Selector de líneas: un producto del catálogo (también oculto) con físico y disponible.
export async function getPickerProduct(
  productId: string,
  orderId: string | null,
): Promise<{ ok: true; data: PickerData } | Fail> {
  return guarded(null, async () => {
    if (typeof productId !== "string") return { ok: false as const, error: "Producto inválido." };
    const data = await readPickerProduct(productId, isOrderId(orderId) ? orderId : null);
    return data ? { ok: true as const, data } : { ok: false as const, error: "El producto no existe." };
  });
}

export async function discardRequest(code: string): Promise<{ ok: true } | Fail> {
  return guarded(null, async () => writeDiscardRequest(code));
}
