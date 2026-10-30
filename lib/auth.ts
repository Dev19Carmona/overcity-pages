import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { getRedis } from "@/lib/redis";

export const SESSION_COOKIE = "overcity_admin";

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

export type LoginResult = { ok: true } | { ok: false; error: string };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  // Se comparan hashes del mismo largo para no filtrar la longitud de la clave.
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// Valor de la cookie: "<expiración en ms>.<HMAC-SHA256>".
function createSessionValue(secret: string): string {
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  return `${expires}.${sign(expires, secret)}`;
}

function isValidSessionValue(value: string, secret: string): boolean {
  const [expires, signature, ...rest] = value.split(".");
  if (!expires || !signature || rest.length > 0) return false;
  if (!safeEqual(signature, sign(expires, secret))) return false;
  return Number(expires) > Date.now();
}

// Verifica la cookie de sesión. Usarla en cada Server Action y Route Handler que escriba.
export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return false;
  // Date.now() no es estable: se marca la lectura como de tiempo de petición antes de usarlo.
  await connection();
  return isValidSessionValue(value, secret);
}

async function getClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function attemptsKey(ip: string): string {
  return `overcity:ratelimit:login:${ip}`;
}

// Comprueba la clave, limita intentos fallidos por IP y abre la sesión. Solo desde Server Actions.
export async function login(password: string): Promise<LoginResult> {
  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!expected || !secret) {
    return { ok: false, error: "El panel no está configurado." };
  }

  const redis = getRedis();
  const ip = await getClientIp();
  const key = attemptsKey(ip);

  if (redis) {
    try {
      const attempts = Number((await redis.get<number>(key)) ?? 0);
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        return { ok: false, error: "Demasiados intentos. Prueba de nuevo en 15 minutos." };
      }
    } catch {
      return { ok: false, error: "No se pudo verificar el acceso. Intenta de nuevo." };
    }
  } else if (process.env.NODE_ENV === "production") {
    // Sin Redis no hay límite de intentos: en producción se rechaza el acceso.
    return { ok: false, error: "El panel no está configurado." };
  }

  if (!safeEqual(password, expected)) {
    if (redis) {
      try {
        const attempts = await redis.incr(key);
        if (attempts === 1) await redis.expire(key, ATTEMPT_WINDOW_SECONDS);
      } catch {
        // El rechazo sigue siendo válido aunque no se pueda contar el intento.
      }
    }
    return { ok: false, error: "Clave incorrecta." };
  }

  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // No bloquea el acceso.
    }
  }

  (await cookies()).set(SESSION_COOKIE, createSessionValue(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
