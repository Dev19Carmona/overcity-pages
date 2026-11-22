import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionRecord } from "@/lib/session";
import type { Permission } from "@/lib/permissions";
import { SECRET, TENANT_ID, fakeRedis } from "./support";

// Se ejecuta la cadena real (cookie → Redis → sesión → permiso); solo se simulan Next, Redis y los
// accesos a datos para que cada punto de entrada llegue o no hasta su lógica.
const state = vi.hoisted(() => ({ sid: undefined as string | undefined, redis: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "overcity_session" && state.sid ? { value: state.sid } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/cache", () => ({ updateTag: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/redis", () => ({ getRedis: () => state.redis }));
vi.mock("@/lib/catalog", () => {
  const ok = { ok: true as const };
  const list = { categories: [], products: [] };
  return {
    getAdminCatalogList: async () => list,
    getAdminColors: async () => ({ colors: [], usage: {} }),
    getAdminEditorMeta: async () => ({ categories: [], colors: [], productCount: 0 }),
    getAdminProduct: async () => null,
    getAdminSettings: async () => ({ title: "t", currency: "COP", whatsapp: "", freeShippingFrom: null }),
    removeProduct: async () => ok,
    writeCategories: async () => ok,
    writeColors: async () => ok,
    writeProduct: async () => ({ ok: true, version: 1, product: {} }),
    writeProductMove: async () => ok,
    writeProductVisible: async () => ok,
    writeSettings: async () => ok,
  };
});
vi.mock("@/lib/content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content")>()),
  getContent: async () => ({ marker: "contenido" }),
  getStoredContent: async () => null,
  replaceLogoUrl: async () => null,
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => null,
  catalogPublicBase: () => "",
  CATALOG_BUCKET: "catalog",
}));

const PERMS: Permission[] = [
  "links.contenido.editar",
  "catalogo.productos.editar",
  "catalogo.categorias.editar",
  "catalogo.colores.editar",
  "catalogo.ajustes.editar",
];

async function signIn(permissions: string[] | null) {
  const redis = fakeRedis();
  state.redis = redis;
  state.sid = undefined;
  if (permissions === null) return;
  state.sid = "sid-test";
  await createSessionRecord({ redis, secret: SECRET, now: Date.now() }, state.sid, {
    sub: "user-1",
    email: "a@b.co",
    name: "Ana",
    claims: {
      sub: "user-1",
      exp: Math.floor(Date.now() / 1000) + 3600,
      tenantId: TENANT_ID,
      permissions,
      modules: ["links", "catalogo"],
    },
    refreshToken: "refresh",
  });
}

beforeEach(() => {
  Object.assign(process.env, {
    AUTH_ISSUER: "https://idp.example.com",
    AUTH_CLIENT_ID: "client",
    AUTH_CLIENT_SECRET: "secret",
    AUTH_TENANT_ID: TENANT_ID,
    AUTH_SESSION_SECRET: SECRET,
    APP_URL: "https://overcity.example",
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

type Outcome = "unauthenticated" | "forbidden" | "allowed";

// Para cada punto de entrada: sin sesión → denegado, con sesión sin el permiso → denegado,
// con el permiso → llega a su lógica.
interface EntryPoint {
  name: string;
  permission: Permission;
  run: () => Promise<Outcome>;
}

const authMessages = {
  unauthenticated: "Tu sesión expiró. Vuelve a entrar.",
  forbidden: "Tu cuenta no tiene permiso para esta acción.",
};

function fromAction(result: { ok: boolean; error?: string }): Outcome {
  if (result.ok) return "allowed";
  if (result.error === authMessages.unauthenticated) return "unauthenticated";
  if (result.error === authMessages.forbidden) return "forbidden";
  return "allowed"; // falló por validación/datos: pasó la autorización
}

function fromResponse(response: Response): Outcome {
  if (response.status === 401) return "unauthenticated";
  if (response.status === 403) return "forbidden";
  return "allowed";
}

const post = (url: string, body: unknown = {}) =>
  new Request(`https://overcity.example${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const entryPoints: EntryPoint[] = [
  {
    name: "saveContent",
    permission: "links.contenido.editar",
    run: async () => fromAction(await (await import("@/app/admin/actions")).saveContent({})),
  },
  {
    name: "loadAdminContent",
    permission: "links.contenido.editar",
    run: async () => ((await (await import("@/app/admin/_lib")).loadAdminContent()) ? "allowed" : "forbidden"),
  },
  {
    name: "loadAdminList",
    permission: "catalogo.productos.editar",
    run: async () => ((await (await import("@/app/admin/_lib")).loadAdminList()) ? "allowed" : "forbidden"),
  },
  {
    name: "loadAdminEditor",
    permission: "catalogo.productos.editar",
    run: async () => ((await (await import("@/app/admin/_lib")).loadAdminEditor("nuevo")) ? "allowed" : "forbidden"),
  },
  {
    name: "loadAdminCategories",
    permission: "catalogo.categorias.editar",
    run: async () => ((await (await import("@/app/admin/_lib")).loadAdminCategories()) ? "allowed" : "forbidden"),
  },
  {
    name: "loadAdminColors",
    permission: "catalogo.colores.editar",
    run: async () => ((await (await import("@/app/admin/_lib")).loadAdminColors()) ? "allowed" : "forbidden"),
  },
  {
    name: "loadAdminSettings",
    permission: "catalogo.ajustes.editar",
    run: async () => ((await (await import("@/app/admin/_lib")).loadAdminSettings()) ? "allowed" : "forbidden"),
  },
  {
    name: "saveProduct",
    permission: "catalogo.productos.editar",
    run: async () => fromAction(await (await import("@/app/admin/catalogo/actions")).saveProduct({}, null)),
  },
  {
    name: "deleteProduct",
    permission: "catalogo.productos.editar",
    run: async () => fromAction(await (await import("@/app/admin/catalogo/actions")).deleteProduct("x")),
  },
  {
    name: "setProductVisible",
    permission: "catalogo.productos.editar",
    run: async () => fromAction(await (await import("@/app/admin/catalogo/actions")).setProductVisible("x", true)),
  },
  {
    name: "moveProduct",
    permission: "catalogo.productos.editar",
    run: async () => fromAction(await (await import("@/app/admin/catalogo/actions")).moveProduct("x", 1)),
  },
  {
    name: "saveCategories",
    permission: "catalogo.categorias.editar",
    run: async () => fromAction(await (await import("@/app/admin/catalogo/actions")).saveCategories([])),
  },
  {
    name: "saveColors",
    permission: "catalogo.colores.editar",
    run: async () => fromAction(await (await import("@/app/admin/catalogo/actions")).saveColors([])),
  },
  {
    name: "saveCatalogSettings",
    permission: "catalogo.ajustes.editar",
    run: async () =>
      fromAction(
        await (await import("@/app/admin/catalogo/actions")).saveCatalogSettings({
          title: "t",
          currency: "COP",
          whatsapp: "573001112233",
          freeShippingFrom: null,
        }),
      ),
  },
  {
    name: "POST /api/logo",
    permission: "links.contenido.editar",
    run: async () => fromResponse(await (await import("@/app/api/logo/route")).POST(post("/api/logo"))),
  },
  {
    name: "DELETE /api/logo",
    permission: "links.contenido.editar",
    run: async () => fromResponse(await (await import("@/app/api/logo/route")).DELETE()),
  },
  {
    name: "POST /api/media",
    permission: "links.contenido.editar",
    run: async () => fromResponse(await (await import("@/app/api/media/route")).POST(post("/api/media"))),
  },
  {
    name: "POST /api/catalog-media",
    permission: "catalogo.productos.editar",
    run: async () =>
      fromResponse(await (await import("@/app/api/catalog-media/route")).POST(post("/api/catalog-media"))),
  },
];

describe.each(entryPoints)("$name", ({ permission, run }) => {
  it("sin sesión → denegado", async () => {
    await signIn(null);
    const outcome = await run();
    expect(["unauthenticated", "forbidden"]).toContain(outcome);
  });

  it("con sesión sin el permiso (solo los demás) → denegado", async () => {
    await signIn(PERMS.filter((p) => p !== permission));
    expect(await run()).toBe("forbidden");
  });

  it("con sesión sin ningún permiso → denegado", async () => {
    await signIn([]);
    expect(await run()).toBe("forbidden");
  });

  it("con el permiso → llega a su lógica", async () => {
    await signIn([permission]);
    expect(await run()).toBe("allowed");
  });
});

describe("rutas de API: códigos exactos", () => {
  it("401 sin sesión y 403 con sesión sin permiso", async () => {
    const { POST } = await import("@/app/api/media/route");
    await signIn(null);
    expect((await POST(post("/api/media"))).status).toBe(401);
    await signIn(["catalogo.categorias.editar"]);
    expect((await POST(post("/api/media"))).status).toBe(403);
  });

  it("un usuario solo con categorías es rechazado en logo, media y catalog-media", async () => {
    await signIn(["catalogo.categorias.editar"]);
    expect((await (await import("@/app/api/logo/route")).POST(post("/api/logo"))).status).toBe(403);
    expect((await (await import("@/app/api/media/route")).POST(post("/api/media"))).status).toBe(403);
    expect(
      (await (await import("@/app/api/catalog-media/route")).POST(post("/api/catalog-media"))).status,
    ).toBe(403);
  });

  it("un usuario solo con links no puede tocar el catálogo", async () => {
    await signIn(["links.contenido.editar"]);
    const actions = await import("@/app/admin/catalogo/actions");
    for (const result of [
      await actions.saveProduct({}, null),
      await actions.deleteProduct("x"),
      await actions.saveCategories([]),
      await actions.saveColors([]),
    ]) {
      expect(result).toEqual({ ok: false, error: authMessages.forbidden });
    }
    expect((await (await import("@/app/api/catalog-media/route")).POST(post("/api/catalog-media"))).status).toBe(403);
  });
});

describe("permisos de token desconocidos", () => {
  it("un permiso core.* o desconocido no concede nada", async () => {
    await signIn(["core.users.read", "links.contenido.editar.extra"]);
    const { getSession, hasAnyAdminPermission } = await import("@/lib/auth");
    expect(hasAnyAdminPermission(await getSession())).toBe(false);
  });
});
