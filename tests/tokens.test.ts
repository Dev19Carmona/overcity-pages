import { generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { TokenError, verifyAccessToken, verifyIdToken } from "@/lib/sso/tokens";
import { RULES, makeKeys, sign, signAccess, type TestKeys } from "./support";

let keys: TestKeys;
beforeAll(async () => {
  keys = await makeKeys();
});

describe("verifyAccessToken", () => {
  it("acepta un token válido", async () => {
    const claims = await verifyAccessToken(await signAccess(keys), RULES, keys.getKey);
    expect(claims.sub).toBe("user-1");
    expect(claims.permissions).toEqual(["links.contenido.editar"]);
    expect(claims.modules).toEqual(["links", "catalogo"]);
  });

  it("rechaza aud distinto", async () => {
    const token = await signAccess(keys, { audience: "otra-app" });
    await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow(TokenError);
  });

  it("rechaza iss distinto", async () => {
    const token = await signAccess(keys, { issuer: "https://evil.example" });
    await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow(TokenError);
  });

  it("rechaza un alg distinto de ES256 (HS256, none)", async () => {
    const hs = await signAccess(keys, { alg: "HS256", key: new TextEncoder().encode("x".repeat(32)) });
    await expect(verifyAccessToken(hs, RULES, keys.getKey)).rejects.toThrow(TokenError);
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "at+jwt" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: "u", iss: RULES.issuer, aud: RULES.clientId, tenant_id: RULES.tenantId, role: "user" }),
    ).toString("base64url");
    await expect(verifyAccessToken(`${header}.${body}.`, RULES, keys.getKey)).rejects.toThrow(TokenError);
  });

  it("rechaza un token expirado", async () => {
    const token = await signAccess(keys, { expiresIn: Math.floor(Date.now() / 1000) - 120 });
    await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow(TokenError);
  });

  it("rechaza una firma ajena con el mismo kid", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const token = await signAccess(keys, { key: privateKey });
    await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow(TokenError);
  });

  it("rechaza typ distinto de at+jwt", async () => {
    const token = await sign(keys, {
      claims: { sub: "u", tenant_id: RULES.tenantId, role: "user", modules: [], permissions: [] },
    });
    await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow(TokenError);
  });

  it("rechaza tenant_id distinto", async () => {
    const token = await signAccess(keys, { claims: { tenant_id: "otra-empresa" } });
    await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow("empresa inesperada");
  });

  it("rechaza role admin (admin de plataforma)", async () => {
    const token = await signAccess(keys, { claims: { role: "admin" } });
    await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow("rol no permitido");
  });

  it("rechaza permissions o modules que no son listas de textos", async () => {
    for (const claims of [{ permissions: "x" }, { modules: [1] }, { permissions: undefined }]) {
      const token = await signAccess(keys, { claims });
      await expect(verifyAccessToken(token, RULES, keys.getKey)).rejects.toThrow(TokenError);
    }
  });
});

describe("verifyIdToken", () => {
  const idClaims = { sub: "user-1", nonce: "nonce-ok", email: "a@b.co", name: "Ana" };

  it("acepta un ID token con el nonce esperado", async () => {
    const token = await sign(keys, { claims: idClaims });
    await expect(verifyIdToken(token, RULES, "nonce-ok", keys.getKey)).resolves.toEqual({
      sub: "user-1",
      email: "a@b.co",
      name: "Ana",
    });
  });

  it("rechaza un nonce distinto", async () => {
    const token = await sign(keys, { claims: idClaims });
    await expect(verifyIdToken(token, RULES, "otro", keys.getKey)).rejects.toThrow("nonce distinto");
  });

  it("rechaza aud o iss erróneos", async () => {
    for (const options of [{ audience: "x" }, { issuer: "https://evil.example" }]) {
      const token = await sign(keys, { claims: idClaims, ...options });
      await expect(verifyIdToken(token, RULES, "nonce-ok", keys.getKey)).rejects.toThrow(TokenError);
    }
  });

  it("no acepta un access token como ID token", async () => {
    const token = await signAccess(keys, { claims: { nonce: "nonce-ok" } });
    await expect(verifyIdToken(token, RULES, "nonce-ok", keys.getKey)).rejects.toThrow(TokenError);
  });
});
