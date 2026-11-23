import { describe, expect, it, vi } from "vitest";
import {
  SESSION_MAX_SECONDS,
  createSessionRecord,
  destroySessionRecord,
  loadSessionRecord,
  lockKey,
  sessionKey,
  type Renewer,
  type SessionRecord,
} from "@/lib/session";
import { SsoError } from "@/lib/sso/client";
import { TokenError, type AccessClaims } from "@/lib/sso/tokens";
import { SECRET, TENANT_ID, fakeRedis } from "./support";

const NOW = 1_800_000_000_000;
const claims = (expOffsetMs: number, permissions = ["links.contenido.editar", "core.users.read"]): AccessClaims => ({
  sub: "user-1",
  exp: Math.floor((NOW + expOffsetMs) / 1000),
  tenantId: TENANT_ID,
  permissions,
  modules: ["links"],
});

async function seed(expOffsetMs: number, now = NOW) {
  const redis = fakeRedis();
  await createSessionRecord({ redis, secret: SECRET, now }, "sid1", {
    sub: "user-1",
    email: "a@b.co",
    name: "Ana",
    claims: claims(expOffsetMs),
    refreshToken: "refresh-1",
  });
  return redis;
}

const noSleep = () => new Promise<void>((resolve) => setImmediate(resolve));
const shortSleep = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
const unusedRenewer: Renewer = async () => {
  throw new Error("no debería renovar");
};

describe("registro de sesión", () => {
  it("guarda el refresh token cifrado y solo permisos conocidos", async () => {
    const redis = await seed(10 * 60_000);
    const raw = redis.store.get(sessionKey("sid1"))!;
    expect(raw).not.toContain("refresh-1");
    const record = JSON.parse(raw) as SessionRecord;
    expect(record.permissions).toEqual(["links.contenido.editar"]);
    expect(record.sessionExpiresAt).toBe(NOW + SESSION_MAX_SECONDS * 1000);
  });

  it("devuelve la sesión sin renovar si el access token vive más de 30 s", async () => {
    const redis = await seed(10 * 60_000);
    const session = await loadSessionRecord({ redis, secret: SECRET, now: NOW, renew: unusedRenewer }, "sid1");
    expect(session).toMatchObject({ sub: "user-1", name: "Ana", permissions: ["links.contenido.editar"] });
  });

  it("devuelve null sin registro", async () => {
    const session = await loadSessionRecord(
      { redis: fakeRedis(), secret: SECRET, now: NOW, renew: unusedRenewer },
      "nope",
    );
    expect(session).toBeNull();
  });

  it("borra la sesión al pasar el máximo absoluto", async () => {
    const redis = await seed(10 * 60_000);
    const later = NOW + SESSION_MAX_SECONDS * 1000 + 1;
    const session = await loadSessionRecord({ redis, secret: SECRET, now: later, renew: unusedRenewer }, "sid1");
    expect(session).toBeNull();
    expect(redis.store.has(sessionKey("sid1"))).toBe(false);
  });
});

describe("renovación", () => {
  it("renueva, actualiza permisos y rota el refresh token cifrado", async () => {
    const redis = await seed(10_000); // vence en 10 s: dentro del margen
    const renew = vi.fn<Renewer>(async (token) => {
      expect(token).toBe("refresh-1");
      return { claims: claims(10 * 60_000, ["catalogo.colores.editar"]), refreshToken: "refresh-2" };
    });
    const session = await loadSessionRecord({ redis, secret: SECRET, now: NOW, renew, sleep: noSleep }, "sid1");
    expect(session?.permissions).toEqual(["catalogo.colores.editar"]);
    const raw = redis.store.get(sessionKey("sid1"))!;
    expect(raw).not.toContain("refresh-2");
    expect(redis.store.has(lockKey("sid1"))).toBe(false); // bloqueo liberado

    // Siguiente renovación usa el token rotado.
    const renew2 = vi.fn<Renewer>(async (token) => {
      expect(token).toBe("refresh-2");
      return { claims: claims(20 * 60_000), refreshToken: "refresh-3" };
    });
    await loadSessionRecord(
      { redis, secret: SECRET, now: NOW + 9 * 60_000 + 40_000, renew: renew2, sleep: noSleep },
      "sid1",
    );
    expect(renew2).toHaveBeenCalledTimes(1);
  });

  it("peticiones simultáneas producen UNA sola renovación", async () => {
    const redis = await seed(5_000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const renew = vi.fn<Renewer>(async () => {
      await gate; // mantiene el bloqueo mientras las demás peticiones llegan
      return { claims: claims(10 * 60_000), refreshToken: "refresh-2" };
    });
    const deps = { redis, secret: SECRET, now: NOW, renew, sleep: shortSleep };
    const calls = [1, 2, 3, 4].map(() => loadSessionRecord(deps, "sid1"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const results = await Promise.all(calls);
    expect(renew).toHaveBeenCalledTimes(1);
    for (const session of results) expect(session?.sub).toBe("user-1");
  });

  it("invalid_grant o tokens que no pasan la verificación borran la sesión", async () => {
    for (const error of [new SsoError("invalid_grant", "x"), new TokenError("x")]) {
      const redis = await seed(5_000);
      const renew: Renewer = async () => {
        throw error;
      };
      const session = await loadSessionRecord({ redis, secret: SECRET, now: NOW, renew, sleep: noSleep }, "sid1");
      expect(session).toBeNull();
      expect(redis.store.has(sessionKey("sid1"))).toBe(false);
      expect(redis.store.has(lockKey("sid1"))).toBe(false);
    }
  });

  it("si el IdP no responde deniega sin borrar, y se recupera después", async () => {
    const redis = await seed(5_000);
    const down: Renewer = async () => {
      throw new SsoError("unavailable", "caído");
    };
    expect(await loadSessionRecord({ redis, secret: SECRET, now: NOW, renew: down, sleep: noSleep }, "sid1")).toBeNull();
    expect(redis.store.has(sessionKey("sid1"))).toBe(true);

    const up: Renewer = async () => ({ claims: claims(10 * 60_000), refreshToken: "refresh-2" });
    const session = await loadSessionRecord({ redis, secret: SECRET, now: NOW, renew: up, sleep: noSleep }, "sid1");
    expect(session?.sub).toBe("user-1");
  });

  it("rechaza si el sub del token renovado cambia", async () => {
    const redis = await seed(5_000);
    const renew: Renewer = async () => ({ claims: { ...claims(10 * 60_000), sub: "otro" }, refreshToken: "r2" });
    expect(await loadSessionRecord({ redis, secret: SECRET, now: NOW, renew, sleep: noSleep }, "sid1")).toBeNull();
    expect(redis.store.has(sessionKey("sid1"))).toBe(false);
  });
});

describe("cierre de sesión", () => {
  it("borra el registro y devuelve el refresh token en claro para revocarlo", async () => {
    const redis = await seed(10 * 60_000);
    const destroyed = await destroySessionRecord(redis, SECRET, "sid1");
    expect(destroyed).toEqual({ sub: "user-1", refreshToken: "refresh-1", idToken: null });
    expect(redis.store.has(sessionKey("sid1"))).toBe(false);
    expect(await destroySessionRecord(redis, SECRET, "sid1")).toBeNull();
  });

  describe("ID token para el cierre único (SPEC 15)", () => {
    async function seedWithIdToken(idToken: string | null | undefined) {
      const redis = fakeRedis();
      await createSessionRecord({ redis, secret: SECRET, now: NOW }, "sid1", {
        sub: "user-1",
        email: "a@b.co",
        name: "Ana",
        claims: claims(10 * 60_000),
        refreshToken: "refresh-1",
        idToken,
      });
      return redis;
    }

    it("lo guarda cifrado, nunca en claro", async () => {
      const redis = await seedWithIdToken("id-token-1");
      const raw = redis.store.get(sessionKey("sid1"))!;
      expect(raw).not.toContain("id-token-1");
      expect(JSON.parse(raw)).toHaveProperty("idToken");
    });

    it("lo devuelve en claro al cerrar la sesión", async () => {
      const redis = await seedWithIdToken("id-token-1");
      expect(await destroySessionRecord(redis, SECRET, "sid1")).toEqual({
        sub: "user-1",
        refreshToken: "refresh-1",
        idToken: "id-token-1",
      });
    });

    it.each([null, undefined])("sin ID token (%s) el registro no lo incluye y se devuelve null", async (value) => {
      const redis = await seedWithIdToken(value);
      expect(JSON.parse(redis.store.get(sessionKey("sid1"))!)).not.toHaveProperty("idToken");
      expect((await destroySessionRecord(redis, SECRET, "sid1"))?.idToken).toBeNull();
    });

    it("una renovación conserva el ID token del login", async () => {
      const redis = await seedWithIdToken("id-token-1");
      const renew: Renewer = async () => ({ claims: claims(10 * 60_000), refreshToken: "refresh-2" });
      await loadSessionRecord({ redis, secret: SECRET, now: NOW + 9 * 60_000, renew }, "sid1");
      expect((await destroySessionRecord(redis, SECRET, "sid1"))?.idToken).toBe("id-token-1");
    });

    it("con el secreto equivocado no se puede abrir el ID token", async () => {
      const redis = await seedWithIdToken("id-token-1");
      expect((await destroySessionRecord(redis, SECRET + "x", "sid1"))?.idToken).toBeNull();
    });
  });
});
