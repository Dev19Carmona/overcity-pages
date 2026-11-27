"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { REQUEST_RATE_LIMIT, REQUEST_RATE_WINDOW_SECONDS } from "@/lib/content-limits";
import { createRequestFromCart } from "@/lib/orders";
import { validateRequestLines } from "@/lib/orders-validate";
import { getRedis } from "@/lib/redis";

// La IP solo se usa como huella en Redis, con caducidad; no se guarda en la solicitud ni en logs.
async function rateKey(): Promise<string> {
  const incoming = await headers();
  const ip =
    incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    incoming.get("x-real-ip") ||
    "desconocida";
  const fingerprint = createHmac("sha256", process.env.AUTH_SESSION_SECRET ?? "overcity")
    .update(ip)
    .digest("hex")
    .slice(0, 32);
  return `overcity:order-request-rate:${fingerprint}`;
}

// La tienda no muestra por qué no hubo código: el motivo queda solo en el registro del servidor.
// Nunca lleva la IP, la bolsa ni datos del cliente.
function skipped(reason: string): { code: null } {
  console.warn(`[orders] request_skipped reason=${reason}`);
  return { code: null };
}

// SPEC 17: la única escritura pública. Guarda la bolsa como solicitud y devuelve su código.
// Nunca lanza ni explica el motivo: con `code: null` la bolsa abre WhatsApp sin código.
export async function createOrderRequest(lines: unknown): Promise<{ code: string | null }> {
  try {
    const checked = validateRequestLines(lines);
    if (!checked.ok) return skipped("invalid_lines");
    const redis = getRedis();
    if (!redis) return skipped("no_redis"); // sin Redis no hay límite, así que no hay solicitud
    const key = await rateKey();
    // La caducidad se fija al crear la clave: la ventana no se alarga con cada intento.
    await redis.set(key, 0, { nx: true, ex: REQUEST_RATE_WINDOW_SECONDS });
    if ((await redis.incr(key)) > REQUEST_RATE_LIMIT) return skipped("rate_limit");
    return { code: await createRequestFromCart(checked.value) };
  } catch (error) {
    console.error("[orders] request_error", error instanceof Error ? error.name : "desconocido");
    return { code: null };
  }
}
