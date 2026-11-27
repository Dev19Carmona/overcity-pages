import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOrderMessage, type CartCatalog, type CartLine } from "@/lib/cart";
import { REQUEST_RATE_LIMIT } from "@/lib/content-limits";
import { REQUEST_CODE_PATTERN } from "@/lib/orders-shared";
import { requestCodeFor } from "@/lib/order-request-client";

// La Server Action y la capa de datos reales; solo se simulan Next, Redis, el catálogo y Supabase.
const state = vi.hoisted(() => ({
  redis: null as unknown,
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  responses: [] as unknown[],
  supabaseDown: false,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));
vi.mock("@/lib/redis", () => ({ getRedis: () => state.redis }));
vi.mock("@/lib/catalog", () => ({
  readProducts: async (ids: string[], onlyVisible: boolean) => {
    if (state.supabaseDown) throw new Error("sin conexión");
    expect(onlyVisible).toBe(true); // los productos ocultos nunca llegan
    return ids.includes("p1")
      ? [
          {
            version: 1,
            product: {
              id: "p1",
              name: "Camisa Oni",
              price: 85_000,
              designs: [
                { id: "d1", name: "Rojo neón", colors: ["Negro"], stock: { Negro: { M: 0 } } },
              ],
            },
          },
        ]
      : [];
  },
}));
vi.mock("@/lib/supabase", () => ({
  PROOF_BUCKET: "payment-proofs",
  catalogImageUrl: (path: string) => path,
  requireSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { currency: "COP" }, error: null }) }),
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args });
      return { data: state.responses.shift() ?? { ok: true }, error: null };
    },
  }),
}));

function counterRedis() {
  const store = new Map<string, number>();
  const options: unknown[] = [];
  return {
    store,
    options,
    async set(key: string, value: number, opts?: { nx?: boolean }) {
      options.push(opts);
      if (!(opts?.nx && store.has(key))) store.set(key, value);
    },
    async incr(key: string) {
      store.set(key, (store.get(key) ?? 0) + 1);
      return store.get(key) as number;
    },
  };
}

const bag = [{ productId: "p1", designId: "d1", color: "Negro", size: "M", qty: 2 }];

async function send(lines: unknown = bag) {
  return (await import("@/app/_actions/order-request")).createOrderRequest(lines);
}

beforeEach(() => {
  state.redis = counterRedis();
  state.rpc = [];
  state.responses = [];
  state.supabaseDown = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("createOrderRequest", () => {
  it("guarda la solicitud con nombres y precios del catálogo e ignora los del navegador", async () => {
    const { code } = await send([{ ...bag[0], productName: "Gratis", unitPrice: 0 }]);
    expect(code).toMatch(REQUEST_CODE_PATTERN);
    expect(state.rpc).toHaveLength(1);
    expect(state.rpc[0].name).toBe("create_order_request");
    expect(state.rpc[0].args.payload).toEqual({
      code,
      currency: "COP",
      lines: [
        { ...bag[0], productName: "Camisa Oni", designName: "Rojo neón", unitPrice: 85_000 },
      ],
    });
  });

  it("reintenta si el código ya existe y se rinde con demasiadas pendientes", async () => {
    state.responses = [{ ok: false, error: "code_taken" }, { ok: true }];
    expect((await send()).code).toMatch(REQUEST_CODE_PATTERN);
    expect(state.rpc).toHaveLength(2);
    state.rpc = [];
    state.responses = [{ ok: false, error: "too_many" }];
    expect(await send()).toEqual({ code: null });
    expect(state.rpc).toHaveLength(1);
  });

  it.each([
    ["producto oculto o inexistente", [{ ...bag[0], productId: "oculto" }]],
    ["diseño inexistente", [{ ...bag[0], designId: "d9" }]],
    ["talla inexistente", [{ ...bag[0], size: "XXL" }]],
    ["clave heredada como talla", [{ ...bag[0], size: "toString" }]],
    ["cantidad 0", [{ ...bag[0], qty: 0 }]],
    ["31 líneas", Array.from({ length: 31 }, (_, i) => ({ ...bag[0], productId: `p${i}` }))],
  ])("rechaza sin escribir: %s", async (_name, lines) => {
    expect(await send(lines)).toEqual({ code: null });
    expect(state.rpc).toHaveLength(0);
  });

  it("limita por IP con una huella que caduca, sin guardar la IP", async () => {
    const redis = counterRedis();
    state.redis = redis;
    for (let i = 0; i < REQUEST_RATE_LIMIT; i++) expect((await send()).code).not.toBeNull();
    expect(await send()).toEqual({ code: null });
    expect(state.rpc).toHaveLength(REQUEST_RATE_LIMIT);
    expect(console.warn).toHaveBeenLastCalledWith("[orders] request_skipped reason=rate_limit");
    const [key] = [...redis.store.keys()];
    expect(key).toMatch(/^overcity:order-request-rate:[0-9a-f]{32}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(redis.options[0]).toEqual({ nx: true, ex: 600 });
    expect(JSON.stringify(state.rpc)).not.toContain("203.0.113.7");
  });

  it("sin Redis, o con Redis o Supabase caídos, responde sin código y sin lanzar", async () => {
    state.redis = null;
    expect(await send()).toEqual({ code: null });
    state.redis = {
      set: async () => {
        throw new Error("redis caído");
      },
    };
    expect(await send()).toEqual({ code: null });
    state.redis = counterRedis();
    state.supabaseDown = true;
    expect(await send()).toEqual({ code: null });
    expect(state.rpc).toHaveLength(0);
  });
});

describe("requestCodeFor (navegador)", () => {
  const lines: CartLine[] = bag;

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reutiliza el código de la misma bolsa y pide otro si cambia", async () => {
    const create = vi.fn(async () => ({ code: "OC-7K3F9" }));
    expect(await requestCodeFor(lines, create)).toBe("OC-7K3F9");
    expect(await requestCodeFor(lines, create)).toBe("OC-7K3F9");
    expect(create).toHaveBeenCalledTimes(1);
    await requestCodeFor([{ ...lines[0], qty: 3 }], create);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("si tarda demasiado o falla, devuelve null y no lo recuerda", async () => {
    const slow = () => new Promise<{ code: string }>(() => undefined);
    expect(await requestCodeFor(lines, slow, 20)).toBeNull();
    expect(
      await requestCodeFor(lines, async () => {
        throw new Error("sin red");
      }),
    ).toBeNull();
    expect(await requestCodeFor(lines, async () => ({ code: null }))).toBeNull();
    expect(await requestCodeFor(lines, async () => ({ code: "OC-22222" }))).toBe("OC-22222");
  });
});

describe("mensaje de WhatsApp", () => {
  const catalog: CartCatalog = {
    colors: [],
    currency: "COP",
    whatsapp: "573001112233",
    freeShippingFrom: null,
    brandName: "OverCity",
    products: [
      {
        id: "p1",
        name: "Camisa Oni",
        price: 85_000,
        designs: [{ id: "d1", name: "Rojo neón", image: "", colors: ["Negro"], stock: {} }],
      },
    ],
  };

  it("agrega el código tras el saludo y sin código no cambia nada más", () => {
    const plain = buildOrderMessage(bag, catalog, "https://x.co").split("\n");
    const coded = buildOrderMessage(bag, catalog, "https://x.co", "OC-7K3F9").split("\n");
    expect(coded[1]).toBe("Código: OC-7K3F9");
    expect([coded[0], ...coded.slice(2)]).toEqual(plain);
    expect(plain.join("\n")).not.toContain("Código");
  });
});
