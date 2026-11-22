import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { codeChallengeS256 } from "./pkce";
import type { TokenRules } from "./tokens";

// Cliente OIDC (Authorization Code + PKCE, contrato sso-v1). No depende de nada de Overcity
// salvo la configuración leída de variables de entorno, para poder extraerlo a un paquete.
export interface SsoConfig extends TokenRules {
  clientSecret: string;
  appUrl: string;
  sessionSecret: string;
}

// null si falta cualquier variable o el secreto de sesión es corto (el login cierra en falla).
export function readSsoConfig(
  env: Record<string, string | undefined> = process.env,
): SsoConfig | null {
  const { AUTH_ISSUER, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET, AUTH_TENANT_ID, AUTH_SESSION_SECRET, APP_URL } = env;
  if (!AUTH_ISSUER || !AUTH_CLIENT_ID || !AUTH_CLIENT_SECRET || !AUTH_TENANT_ID || !APP_URL) return null;
  if (!AUTH_SESSION_SECRET || AUTH_SESSION_SECRET.length < 32) return null;
  return {
    issuer: AUTH_ISSUER,
    clientId: AUTH_CLIENT_ID,
    clientSecret: AUTH_CLIENT_SECRET,
    tenantId: AUTH_TENANT_ID,
    appUrl: APP_URL.replace(/\/+$/, ""),
    sessionSecret: AUTH_SESSION_SECRET,
  };
}

export interface TokenSet {
  accessToken: string;
  idToken: string | null;
  refreshToken: string;
}

// invalid_grant: hay que volver a iniciar sesión. unavailable: el IdP no respondió (red o 5xx).
export class SsoError extends Error {
  constructor(
    readonly kind: "invalid_grant" | "unavailable" | "invalid_response",
    message: string,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 8000;

function base(config: SsoConfig): string {
  return config.issuer.replace(/\/+$/, "");
}

export function redirectUri(config: SsoConfig): string {
  return `${config.appUrl}/auth/callback`;
}

export function buildAuthorizeUrl(
  config: SsoConfig,
  params: { state: string; nonce: string; verifier: string },
): string {
  const url = new URL(`${base(config)}/oidc/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri(config),
    scope: "openid profile email",
    state: params.state,
    nonce: params.nonce,
    code_challenge: codeChallengeS256(params.verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function basicAuth(config: SsoConfig): string {
  const pair = `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

async function post(
  config: SsoConfig,
  path: string,
  form: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImpl(`${base(config)}${path}`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(config),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(form).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SsoError("unavailable", "El proveedor de identidad no respondió.");
  }
}

async function readTokens(response: Response): Promise<TokenSet> {
  if (response.status >= 500 || response.status === 429) {
    throw new SsoError("unavailable", `El proveedor respondió ${response.status}.`);
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = typeof body?.error === "string" ? body.error : "error";
    throw new SsoError(
      code === "invalid_grant" ? "invalid_grant" : "invalid_response",
      `El proveedor rechazó la petición (${code}).`,
    );
  }
  if (typeof body?.access_token !== "string" || typeof body.refresh_token !== "string") {
    throw new SsoError("invalid_response", "Respuesta de tokens incompleta.");
  }
  return {
    accessToken: body.access_token,
    idToken: typeof body.id_token === "string" ? body.id_token : null,
    refreshToken: body.refresh_token,
  };
}

export async function exchangeCode(
  config: SsoConfig,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  const response = await post(
    config,
    "/oidc/token",
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(config),
      code_verifier: verifier,
    },
    fetchImpl,
  );
  return readTokens(response);
}

export async function refreshTokens(
  config: SsoConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  const response = await post(
    config,
    "/oidc/token",
    { grant_type: "refresh_token", refresh_token: refreshToken },
    fetchImpl,
  );
  return readTokens(response);
}

// Revoca el refresh token; nunca lanza (si falla, el cierre de sesión local sigue).
export async function revokeToken(
  config: SsoConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await post(
      config,
      "/oidc/revoke",
      { token: refreshToken, token_type_hint: "refresh_token" },
      fetchImpl,
    );
    return response.ok;
  } catch {
    return false;
  }
}

// JWKS remoto con caché y recarga ante un `kid` desconocido (lo hace `jose`).
let jwksCache: { url: string; getKey: JWTVerifyGetKey } | null = null;
export function getJwks(config: SsoConfig): JWTVerifyGetKey {
  const url = `${base(config)}/.well-known/jwks.json`;
  if (jwksCache?.url !== url) {
    jwksCache = { url, getKey: createRemoteJWKSet(new URL(url)) };
  }
  return jwksCache.getKey;
}
