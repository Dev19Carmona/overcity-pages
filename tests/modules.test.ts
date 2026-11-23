import { describe, expect, it, vi } from "vitest";
import { MODULES_KEY, fetchActiveModules, isActive, loadModules } from "@/lib/modules";
import { readSsoConfig } from "@/lib/sso/client";
import { CLIENT_ID, ISSUER, SECRET, fakeRedis } from "./support";

const config = { issuer: ISSUER, clientId: CLIENT_ID, clientSecret: SECRET };
const NOW = 1_800_000_000_000;

function jsonFetch(body: unknown, status = 200) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
const failingFetch = () => vi.fn(async () => { throw new Error("red caída"); }) as unknown as typeof fetch;

describe("fetchActiveModules", () => {
  it("llama a /oidc/modules con Basic y devuelve los módulos", async () => {
    const fetchImpl = jsonFetch({ tenantId: "t", modules: ["catalogo", "links"] });
    await expect(fetchActiveModules(config, fetchImpl)).resolves.toEqual(["catalogo", "links"]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ISSUER}/oidc/modules`);
    const expected = Buffer.from(`${CLIENT_ID}:${encodeURIComponent(SECRET)}`).toString("base64");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${expected}`);
  });

  it("falla con 401, 5xx o forma inesperada", async () => {
    await expect(fetchActiveModules(config, jsonFetch({ error: "x" }, 401))).rejects.toThrow();
    await expect(fetchActiveModules(config, jsonFetch({}, 503))).rejects.toThrow();
    await expect(fetchActiveModules(config, jsonFetch({ modules: "links" }))).rejects.toThrow();
    await expect(fetchActiveModules(config, jsonFetch({ modules: [1] }))).rejects.toThrow();
  });
});

describe("loadModules e isActive", () => {
  it("respuesta válida: activo el que viene, apagado el ausente", async () => {
    const result = await loadModules({ config, fetchImpl: jsonFetch({ tenantId: "t", modules: ["links"] }) });
    expect(result).toEqual({ modules: ["links"], source: "live" });
    expect(isActive(result.modules, "links")).toBe(true);
    expect(isActive(result.modules, "catalogo")).toBe(false);
  });

  it("modules [] apaga ambos módulos (no es un fallo)", async () => {
    const result = await loadModules({ config, fetchImpl: jsonFetch({ tenantId: "t", modules: [] }) });
    expect(result.source).toBe("live");
    expect(isActive(result.modules, "links")).toBe(false);
    expect(isActive(result.modules, "catalogo")).toBe(false);
  });

  it("cada módulo responde por sí mismo", async () => {
    const onlyCatalog = await loadModules({ config, fetchImpl: jsonFetch({ tenantId: "t", modules: ["catalogo"] }) });
    expect(isActive(onlyCatalog.modules, "links")).toBe(false);
    expect(isActive(onlyCatalog.modules, "catalogo")).toBe(true);
  });

  it("guarda el último valor conocido en Redis tras una respuesta correcta", async () => {
    const redis = fakeRedis();
    await loadModules({ config, fetchImpl: jsonFetch({ tenantId: "t", modules: ["links"] }), store: redis, now: () => NOW });
    expect(JSON.parse(redis.store.get(MODULES_KEY)!)).toEqual({ modules: ["links"], fetchedAt: NOW });
  });

  it("si la consulta falla y hay valor conocido, lo usa", async () => {
    const redis = fakeRedis();
    await redis.set(MODULES_KEY, { modules: ["catalogo"], fetchedAt: NOW });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const fetchImpl of [failingFetch(), jsonFetch({}, 401), jsonFetch({}, 500)]) {
      const result = await loadModules({ config, fetchImpl, store: redis });
      expect(result).toEqual({ modules: ["catalogo"], source: "known" });
    }
    // Un fallo no pisa el valor conocido.
    expect(JSON.parse(redis.store.get(MODULES_KEY)!).modules).toEqual(["catalogo"]);
  });

  it("si falla y no hay valor conocido, los módulos cuentan como activos", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await loadModules({ config, fetchImpl: failingFetch(), store: fakeRedis() });
    expect(result).toEqual({ modules: null, source: "unknown" });
    expect(isActive(result.modules, "links")).toBe(true);
    expect(isActive(result.modules, "catalogo")).toBe(true);
    // Sin Redis configurado pasa lo mismo.
    expect((await loadModules({ config, fetchImpl: failingFetch(), store: null })).modules).toBeNull();
  });

  it("con el SSO sin configurar no consulta y todo cuenta como activo", async () => {
    const fetchImpl = jsonFetch({ modules: [] });
    expect(readSsoConfig({})).toBeNull();
    const result = await loadModules({ config: readSsoConfig({}), fetchImpl });
    expect(result).toEqual({ modules: null, source: "unconfigured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(isActive(result.modules, "links")).toBe(true);
  });

  it("el client_secret no aparece en los logs", async () => {
    const spies = (["log", "warn", "error", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const leaky = vi.fn(async () => { throw new Error("fallo de red"); }) as unknown as typeof fetch;
    await loadModules({ config, fetchImpl: leaky, store: fakeRedis() });
    await loadModules({ config, fetchImpl: jsonFetch({}, 401), store: fakeRedis() });
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(encodeURIComponent(SECRET));
    expect(logged).not.toContain(Buffer.from(`${CLIENT_ID}:${encodeURIComponent(SECRET)}`).toString("base64"));
    expect(spies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
  });
});
