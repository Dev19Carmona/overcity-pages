import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK, type JWTVerifyGetKey } from "jose";
import type { SessionRedis } from "@/lib/session";

export const ISSUER = "https://idp.example.com";
export const CLIENT_ID = "overcity-client";
export const TENANT_ID = "11111111-1111-1111-1111-111111111111";
export const RULES = { issuer: ISSUER, clientId: CLIENT_ID, tenantId: TENANT_ID };
export const SECRET = "0123456789abcdef0123456789abcdef-secret";

// Redis falso en memoria: guarda copias JSON (como Upstash) y soporta NX.
export function fakeRedis(): SessionRedis & { store: Map<string, string>; calls: string[] } {
  const store = new Map<string, string>();
  const calls: string[] = [];
  return {
    store,
    calls,
    async get<T>(key: string) {
      const raw = store.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    async set(key, value, options) {
      calls.push(`set:${key}`);
      if (options?.nx && store.has(key)) return null;
      store.set(key, JSON.stringify(value));
      return "OK";
    },
    async del(...keys: string[]) {
      for (const key of keys) {
        calls.push(`del:${key}`);
        store.delete(key);
      }
      return keys.length;
    },
  };
}

export interface TestKeys {
  kid: string;
  privateKey: CryptoKey;
  getKey: JWTVerifyGetKey;
}

export async function makeKeys(kid = "k1"): Promise<TestKeys> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
  return { kid, privateKey: privateKey as CryptoKey, getKey: createLocalJWKSet({ keys: [jwk] }) };
}

export interface SignOptions {
  claims?: Record<string, unknown>;
  alg?: string;
  typ?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  key?: CryptoKey | Uint8Array;
  kid?: string;
}

export async function sign(keys: TestKeys, options: SignOptions = {}): Promise<string> {
  const alg = options.alg ?? "ES256";
  return new SignJWT({ ...(options.claims ?? {}) })
    .setProtectedHeader({ alg, typ: options.typ ?? "JWT", kid: options.kid ?? keys.kid })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "10m")
    .sign(options.key ?? keys.privateKey);
}

export const accessClaims = (extra: Record<string, unknown> = {}) => ({
  sub: "user-1",
  tenant_id: TENANT_ID,
  role: "user",
  modules: ["links", "catalogo"],
  permissions: ["links.contenido.editar"],
  ...extra,
});

export const signAccess = (keys: TestKeys, options: SignOptions = {}) =>
  sign(keys, { typ: "at+jwt", ...options, claims: accessClaims(options.claims) });
