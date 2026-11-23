import "server-only";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { getRedis } from "@/lib/redis";
import { readSsoConfig, type SsoConfig } from "@/lib/sso/client";

// SPEC 14: módulos activos de la empresa según base-template (GET {AUTH_ISSUER}/oidc/modules, SPEC 20).
// Las páginas públicas no tienen sesión, así que se pregunta por contrato con las credenciales de la app.

export type ModuleKey = "links" | "catalogo";

export const MODULES_KEY = "overcity:modules:v1";
const REQUEST_TIMEOUT_MS = 5000;

// Último valor conocido, guardado en Redis solo para cuando la consulta falla.
interface KnownModules {
  modules: string[];
  fetchedAt: number;
}

export interface ModulesStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
}

export interface LoadModulesDeps {
  config: Pick<SsoConfig, "issuer" | "clientId" | "clientSecret"> | null;
  fetchImpl?: typeof fetch;
  store?: ModulesStore | null;
  now?: () => number;
}

export interface LoadedModules {
  // null = no se sabe: el módulo se trata como activo.
  modules: string[] | null;
  source: "live" | "known" | "unknown" | "unconfigured";
}

// Consulta a base-template. Lanza si no hay respuesta válida (red, 401, 5xx, forma inesperada).
// Nunca incluye el secreto en el mensaje de error.
export async function fetchActiveModules(
  config: NonNullable<LoadModulesDeps["config"]>,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const pair = `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`;
  const response = await fetchImpl(`${config.issuer.replace(/\/+$/, "")}/oidc/modules`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(pair).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`base-template respondió ${response.status}`);
  const body = (await response.json().catch(() => null)) as { modules?: unknown } | null;
  if (!body || !Array.isArray(body.modules) || !body.modules.every((m) => typeof m === "string")) {
    throw new Error("Respuesta de módulos con forma inesperada");
  }
  return body.modules as string[];
}

// Lógica pura e inyectable: consulta, guarda el último valor y, si falla, usa el conocido.
export async function loadModules(deps: LoadModulesDeps): Promise<LoadedModules> {
  const { config, fetchImpl = fetch, store = null, now = Date.now } = deps;
  if (!config) return { modules: null, source: "unconfigured" };

  try {
    const modules = await fetchActiveModules(config, fetchImpl);
    try {
      await store?.set(MODULES_KEY, { modules, fetchedAt: now() } satisfies KnownModules);
    } catch {
      // Perder el respaldo no debe tumbar la página.
    }
    return { modules, source: "live" };
  } catch (error) {
    console.warn(
      "[modules] No se pudo consultar los módulos activos:",
      error instanceof Error ? error.message : "error desconocido",
    );
  }

  try {
    const known = await store?.get<KnownModules>(MODULES_KEY);
    if (known && Array.isArray(known.modules)) return { modules: known.modules, source: "known" };
  } catch {
    // Sin Redis tampoco hay valor conocido.
  }
  return { modules: null, source: "unknown" };
}

// Caché de ~60 s (revalidate) para no consultar en cada visita. `expire` queda en 5 min para que el
// resultado forme parte del prerender en vez de volverse un hueco dinámico (cacheComponents).
export async function getActiveModules(): Promise<string[] | null> {
  "use cache";

  const result = await loadModules({ config: readSsoConfig(), store: getRedis() });
  // Si falló la consulta, se reintenta pronto.
  if (result.source === "live" || result.source === "unconfigured") {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  } else {
    cacheLife({ stale: 30, revalidate: 15, expire: 300 });
  }
  return result.modules;
}

// Sin valor conocido (o con SSO sin configurar) el módulo cuenta como activo.
export function isActive(modules: string[] | null, key: ModuleKey): boolean {
  return modules === null || modules.includes(key);
}

export async function isModuleActive(key: ModuleKey): Promise<boolean> {
  return isActive(await getActiveModules(), key);
}

// Para páginas: responde 404 (página "Esta sección no está disponible") si el módulo está apagado.
export async function requireModule(key: ModuleKey): Promise<void> {
  if (!(await isModuleActive(key))) notFound();
}
