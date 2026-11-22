import { jwtVerify, type JWTVerifyGetKey } from "jose";

export interface TokenRules {
  issuer: string;
  clientId: string;
  tenantId: string;
}

export interface AccessClaims {
  sub: string;
  exp: number; // segundos
  tenantId: string;
  permissions: string[];
  modules: string[];
}

export interface IdClaims {
  sub: string;
  email: string;
  name: string;
}

export class TokenError extends Error {}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Verifica firma (solo ES256), emisor, audiencia, vigencia y `typ: at+jwt`, y las reglas de Overcity:
// empresa esperada, rol `user` y listas de permisos y módulos. `getKey` es el JWKS (remoto o de pruebas).
export async function verifyAccessToken(
  token: string,
  rules: TokenRules,
  getKey: JWTVerifyGetKey,
): Promise<AccessClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, getKey, {
      algorithms: ["ES256"],
      issuer: rules.issuer,
      audience: rules.clientId,
      typ: "at+jwt",
    }));
  } catch (error) {
    throw new TokenError(`access token inválido: ${error instanceof Error ? error.message : "error"}`);
  }
  if (typeof payload.sub !== "string" || !payload.sub) throw new TokenError("access token sin sub");
  if (typeof payload.exp !== "number") throw new TokenError("access token sin exp");
  if (payload.tenant_id !== rules.tenantId) throw new TokenError("empresa inesperada");
  if (payload.role !== "user") throw new TokenError("rol no permitido");
  if (!isStringList(payload.permissions) || !isStringList(payload.modules)) {
    throw new TokenError("permissions o modules inválidos");
  }
  return {
    sub: payload.sub,
    exp: payload.exp,
    tenantId: payload.tenant_id,
    permissions: payload.permissions,
    modules: payload.modules,
  };
}

// Verifica el ID token y su `nonce`. Un access token (`typ: at+jwt`) no se acepta como ID token.
export async function verifyIdToken(
  token: string,
  rules: TokenRules,
  expectedNonce: string,
  getKey: JWTVerifyGetKey,
): Promise<IdClaims> {
  let result;
  try {
    result = await jwtVerify(token, getKey, {
      algorithms: ["ES256"],
      issuer: rules.issuer,
      audience: rules.clientId,
    });
  } catch (error) {
    throw new TokenError(`id token inválido: ${error instanceof Error ? error.message : "error"}`);
  }
  const { payload, protectedHeader } = result;
  if (protectedHeader.typ === "at+jwt") throw new TokenError("un access token no es un id token");
  if (payload.nonce !== expectedNonce) throw new TokenError("nonce distinto");
  if (typeof payload.sub !== "string" || !payload.sub) throw new TokenError("id token sin sub");
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
    name: typeof payload.name === "string" ? payload.name : "",
  };
}
