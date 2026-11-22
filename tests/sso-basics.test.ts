import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, seal } from "@/lib/sso/crypto";
import { buildAuthorizeUrl, readSsoConfig } from "@/lib/sso/client";
import { openFlow, safeEqualText, sanitizeReturnTo, sealFlow } from "@/lib/sso/flow-cookie";
import { codeChallengeS256, createCodeVerifier } from "@/lib/sso/pkce";
import { CLIENT_ID, ISSUER, SECRET, TENANT_ID } from "./support";

describe("PKCE", () => {
  it("el challenge es BASE64URL(SHA256(verifier))", () => {
    const verifier = createCodeVerifier();
    expect(verifier).toHaveLength(43);
    expect(codeChallengeS256(verifier)).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("coincide con el vector de RFC 7636", () => {
    expect(codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("cookie de flujo", () => {
  const flow = { state: "s", nonce: "n", verifier: "v", returnTo: "/admin/catalogo" };

  it("ida y vuelta", () => {
    expect(openFlow(sealFlow(flow, SECRET), SECRET)).toEqual(flow);
  });

  it("rechaza ausente, manipulada, truncada o con otro secreto", () => {
    const sealed = sealFlow(flow, SECRET);
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
    expect(openFlow(undefined, SECRET)).toBeNull();
    expect(openFlow("", SECRET)).toBeNull();
    expect(openFlow(tampered, SECRET)).toBeNull();
    expect(openFlow(sealed.slice(0, 20), SECRET)).toBeNull();
    expect(openFlow(sealed, SECRET + "x")).toBeNull();
  });

  it("no sirve un valor cifrado para otro uso (contexto distinto)", () => {
    expect(openFlow(seal(JSON.stringify(flow), SECRET, "session-refresh-token"), SECRET)).toBeNull();
    expect(open(sealFlow(flow, SECRET), SECRET, "session-refresh-token")).toBeNull();
  });

  it("compara en tiempo constante textos de igual y distinto largo", () => {
    expect(safeEqualText("abc", "abc")).toBe(true);
    expect(safeEqualText("abc", "abd")).toBe(false);
    expect(safeEqualText("abc", "abcd")).toBe(false);
  });
});

describe("sanitizeReturnTo", () => {
  it.each(["/admin", "/admin/catalogo", "/admin/catalogo/producto/nuevo", "/admin?x=1"])(
    "acepta %s",
    (value) => expect(sanitizeReturnTo(value)).toBe(value),
  );

  it.each([
    "//evil.com",
    "/admin//evil.com",
    "https://evil.com",
    "http://evil.com/admin",
    "javascript:alert(1)",
    "\\evil.com",
    "/admin\\evil",
    "/",
    "/otra",
    "/administrador",
    "/admin\r\nX: y",
    "",
    null,
    undefined,
  ])("redirige a /admin con %j", (value) => expect(sanitizeReturnTo(value)).toBe("/admin"));
});

describe("configuración y URL de autorización", () => {
  const env = {
    AUTH_ISSUER: ISSUER,
    AUTH_CLIENT_ID: CLIENT_ID,
    AUTH_CLIENT_SECRET: "secret",
    AUTH_TENANT_ID: TENANT_ID,
    AUTH_SESSION_SECRET: SECRET,
    APP_URL: "https://overcity.example/",
  };

  it("cierra en falla si falta una variable o el secreto es corto", () => {
    expect(readSsoConfig(env)).not.toBeNull();
    for (const key of Object.keys(env)) {
      expect(readSsoConfig({ ...env, [key]: undefined })).toBeNull();
    }
    expect(readSsoConfig({ ...env, AUTH_SESSION_SECRET: "corto" })).toBeNull();
  });

  it("arma la URL con PKCE S256 y redirect_uri de APP_URL", () => {
    const config = readSsoConfig(env)!;
    const url = new URL(buildAuthorizeUrl(config, { state: "st", nonce: "no", verifier: "ver" }));
    expect(url.origin + url.pathname).toBe(`${ISSUER}/oidc/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://overcity.example/auth/callback");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallengeS256("ver"));
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("nonce")).toBe("no");
  });
});
