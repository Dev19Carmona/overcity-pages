import { open, seal } from "@/lib/sso/crypto";
import { SsoError } from "@/lib/sso/client";
import { TokenError, type AccessClaims } from "@/lib/sso/tokens";
import { knownPermissions, type Session } from "@/lib/permissions";

// Sesión en el servidor (SPEC 13): cookie opaca + registro en Redis `overcity:session:<sid>`.
// Sin `server-only` ni `next/*` para poder probarla con un Redis falso; `lib/auth.ts` la cablea.
export const SESSION_COOKIE = "overcity_session";
export const SESSION_MAX_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_MARGIN_MS = 30_000;
const LOCK_SECONDS = 15;
const LOCK_WAIT_STEP_MS = 200;
const LOCK_WAIT_TRIES = 50; // ~10 s: algo más que el timeout del IdP (8 s)
const SEAL_CONTEXT = "session-refresh-token";

export interface SessionRecord {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  permissions: string[]; // solo las claves conocidas de Overcity
  modules: string[];
  accessExpiresAt: number; // ms, del exp del access token
  refreshToken: string; // cifrado con AES-256-GCM; nunca en claro
  createdAt: number;
  sessionExpiresAt: number; // máximo absoluto: 7 días desde createdAt
}

// Subconjunto de Redis que usa la sesión (lo cumple el cliente de Upstash).
export interface SessionRedis {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number; nx?: boolean }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

// Renueva con el refresh token (en claro) y devuelve los claims ya verificados y el token rotado.
// Lanza SsoError (invalid_grant / unavailable) o TokenError.
export type Renewer = (refreshToken: string) => Promise<{ claims: AccessClaims; refreshToken: string }>;

export interface SessionDeps {
  redis: SessionRedis;
  secret: string;
  now: number;
  renew: Renewer;
  sleep?: (ms: number) => Promise<void>;
}

export const sessionKey = (sid: string) => `overcity:session:${sid}`;
export const lockKey = (sid: string) => `overcity:session-lock:${sid}`;

function toSession(record: SessionRecord): Session {
  return {
    sub: record.sub,
    email: record.email,
    name: record.name,
    permissions: knownPermissions(record.permissions),
    modules: record.modules,
  };
}

function remainingSeconds(record: SessionRecord, now: number): number {
  return Math.max(1, Math.ceil((record.sessionExpiresAt - now) / 1000));
}

export interface NewSession {
  sub: string;
  email: string;
  name: string;
  claims: AccessClaims;
  refreshToken: string;
}

// Guarda un registro nuevo bajo `sid` (identificador opaco generado por quien llama).
export async function createSessionRecord(
  deps: Pick<SessionDeps, "redis" | "secret" | "now">,
  sid: string,
  input: NewSession,
): Promise<number> {
  const record: SessionRecord = {
    sub: input.sub,
    email: input.email,
    name: input.name,
    tenantId: input.claims.tenantId,
    permissions: knownPermissions(input.claims.permissions),
    modules: input.claims.modules,
    accessExpiresAt: input.claims.exp * 1000,
    refreshToken: seal(input.refreshToken, deps.secret, SEAL_CONTEXT),
    createdAt: deps.now,
    sessionExpiresAt: deps.now + SESSION_MAX_SECONDS * 1000,
  };
  await deps.redis.set(sessionKey(sid), record, { ex: SESSION_MAX_SECONDS });
  return SESSION_MAX_SECONDS;
}

function log(event: string, sub: string) {
  console.warn(`[auth] ${event} sub=${sub}`);
}

// Devuelve la sesión vigente (renovándola si el access token está por vencer) o null.
// Cierra en falla: si el IdP no responde, deniega sin borrar el registro.
export async function loadSessionRecord(deps: SessionDeps, sid: string): Promise<Session | null> {
  const { redis, now } = deps;
  const record = await redis.get<SessionRecord>(sessionKey(sid));
  if (!record) return null;

  if (now >= record.sessionExpiresAt) {
    await redis.del(sessionKey(sid));
    return null;
  }
  if (record.accessExpiresAt - now > REFRESH_MARGIN_MS) return toSession(record);

  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const locked = await redis.set(lockKey(sid), "1", { nx: true, ex: LOCK_SECONDS });

  if (!locked) {
    // Otra petición está renovando: se espera y se relee. No se usa el refresh token aquí.
    for (let i = 0; i < LOCK_WAIT_TRIES; i++) {
      await sleep(LOCK_WAIT_STEP_MS);
      const current = await redis.get<SessionRecord>(sessionKey(sid));
      if (!current) return null; // la otra petición cerró la sesión
      if (current.accessExpiresAt - now > REFRESH_MARGIN_MS) return toSession(current);
    }
    return null;
  }

  try {
    // Otra petición pudo renovar justo antes de que tomáramos el bloqueo.
    const latest = (await redis.get<SessionRecord>(sessionKey(sid))) ?? null;
    if (!latest) return null;
    if (latest.accessExpiresAt - now > REFRESH_MARGIN_MS) return toSession(latest);

    const refreshToken = open(latest.refreshToken, deps.secret, SEAL_CONTEXT);
    if (!refreshToken) {
      await redis.del(sessionKey(sid));
      log("session_corrupt", latest.sub);
      return null;
    }

    let renewed;
    try {
      renewed = await deps.renew(refreshToken);
    } catch (error) {
      if (error instanceof SsoError && error.kind === "unavailable") {
        log("refresh_unavailable", latest.sub);
        return null; // se conserva la sesión para cuando el IdP vuelva
      }
      if (error instanceof SsoError || error instanceof TokenError) {
        await redis.del(sessionKey(sid));
        log("refresh_rejected", latest.sub);
        return null;
      }
      throw error;
    }

    if (renewed.claims.sub !== latest.sub) {
      await redis.del(sessionKey(sid));
      log("refresh_sub_mismatch", latest.sub);
      return null;
    }

    const next: SessionRecord = {
      ...latest,
      tenantId: renewed.claims.tenantId,
      permissions: knownPermissions(renewed.claims.permissions),
      modules: renewed.claims.modules,
      accessExpiresAt: renewed.claims.exp * 1000,
      refreshToken: seal(renewed.refreshToken, deps.secret, SEAL_CONTEXT),
    };
    await redis.set(sessionKey(sid), next, { ex: remainingSeconds(next, now) });
    return toSession(next);
  } finally {
    await redis.del(lockKey(sid)).catch(() => undefined);
  }
}

// Borra el registro y devuelve el refresh token en claro (para revocarlo), o null.
export async function destroySessionRecord(
  redis: SessionRedis,
  secret: string,
  sid: string,
): Promise<{ sub: string; refreshToken: string | null } | null> {
  const record = await redis.get<SessionRecord>(sessionKey(sid)).catch(() => null);
  await redis.del(sessionKey(sid), lockKey(sid));
  if (!record) return null;
  return { sub: record.sub, refreshToken: open(record.refreshToken, secret, SEAL_CONTEXT) };
}
