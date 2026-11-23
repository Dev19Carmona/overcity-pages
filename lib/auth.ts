import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getRedis } from "@/lib/redis";
import {
  can,
  firstAllowedPath,
  hasAnyAdminPermission,
  type Permission,
  type Session,
} from "@/lib/permissions";
import {
  SESSION_COOKIE,
  SESSION_MAX_SECONDS,
  createSessionRecord,
  destroySessionRecord,
  loadSessionRecord,
  type Renewer,
} from "@/lib/session";
import {
  buildEndSessionUrl,
  getJwks,
  readSsoConfig,
  refreshTokens,
  revokeToken,
  type SsoConfig,
} from "@/lib/sso/client";
import { randomToken } from "@/lib/sso/pkce";
import { verifyAccessToken, type AccessClaims } from "@/lib/sso/tokens";

export { SESSION_COOKIE };
export { can, firstAllowedPath, hasAnyAdminPermission };
export type { Permission, Session };

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

function makeRenewer(config: SsoConfig): Renewer {
  return async (refreshToken) => {
    const tokens = await refreshTokens(config, refreshToken);
    const claims = await verifyAccessToken(tokens.accessToken, config, getJwks(config));
    return { claims, refreshToken: tokens.refreshToken };
  };
}

// Sesión vigente del panel o null (sin cookie, caducada, revocada o IdP caído en una renovación).
// Cacheada por petición para que layout y página no renueven dos veces.
export const getSession = cache(async (): Promise<Session | null> => {
  const config = readSsoConfig();
  const redis = getRedis();
  if (!config || !redis) return null;
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  // Date.now() no es estable: se marca la lectura como de tiempo de petición antes de usarlo.
  await connection();
  try {
    return await loadSessionRecord(
      { redis, secret: config.sessionSecret, now: Date.now(), renew: makeRenewer(config) },
      sid,
    );
  } catch (error) {
    console.error("[auth] session_error", error instanceof Error ? error.message : "desconocido");
    return null;
  }
});

export type Authorization =
  | { ok: true; session: Session }
  | { ok: false; status: 401 | 403; error: string };

// Exige sesión y un permiso. 401 sin sesión, 403 con sesión pero sin el permiso (se registra el `sub`).
export async function requirePermission(permission: Permission): Promise<Authorization> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "Tu sesión expiró. Vuelve a entrar." };
  if (!can(session, permission)) {
    console.warn(`[auth] denied sub=${session.sub} permission=${permission}`);
    return { ok: false, status: 403, error: "Tu cuenta no tiene permiso para esta acción." };
  }
  return { ok: true, session };
}

// Abre la sesión tras un callback verificado. Solo desde Route Handlers o Server Actions.
export async function startSession(input: {
  sub: string;
  email: string;
  name: string;
  claims: AccessClaims;
  refreshToken: string;
  idToken?: string | null;
}): Promise<void> {
  const config = readSsoConfig();
  const redis = getRedis();
  if (!config || !redis) throw new Error("SSO o Redis sin configurar");
  await connection();
  const sid = randomToken(32);
  await createSessionRecord({ redis, secret: config.sessionSecret, now: Date.now() }, sid, input);
  (await cookies()).set(SESSION_COOKIE, sid, { ...cookieOptions(), maxAge: SESSION_MAX_SECONDS });
  console.warn(`[auth] login sub=${input.sub}`);
}

// Revoca el refresh token en el IdP (si falla, sigue), borra el registro y la cookie.
// Devuelve la URL a la que enviar al navegador para cerrar también la sesión en base-template
// (cierre de sesión único, SPEC 15), o null si no se puede (sesión anterior a esa spec, sin
// registro o error): en ese caso solo se cerró la sesión de Overcity.
export async function logout(): Promise<string | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (!sid) return null;
  const config = readSsoConfig();
  const redis = getRedis();
  if (!config || !redis) return null;
  try {
    const destroyed = await destroySessionRecord(redis, config.sessionSecret, sid);
    if (destroyed?.refreshToken) await revokeToken(config, destroyed.refreshToken);
    if (destroyed) console.warn(`[auth] logout sub=${destroyed.sub}`);
    return destroyed?.idToken ? buildEndSessionUrl(config, destroyed.idToken) : null;
  } catch (error) {
    console.error("[auth] logout_error", error instanceof Error ? error.message : "desconocido");
    return null;
  }
}
