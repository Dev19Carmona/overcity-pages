// Copia el catálogo (tablas y fotos de diseños) de un proyecto de Supabase a la base local de pruebas.
//
//   npx supabase start
//   cp .env.copy.example .env.copy.local      # y completar los 4 valores
//   npm run db:copy -- --dry-run
//   npm run db:copy
//
// Protecciones:
// - El origen es de solo lectura: su cliente rechaza cualquier petición que no sea GET o HEAD.
// - El destino tiene que estar en este computador (127.0.0.1 o localhost) y ser distinto del origen.
// - No escribe si el destino ya tiene datos. Para repetir la copia: `npx supabase db reset`.
//
// Las tablas se leen una tras otra, sin una transacción común: conviene copiar cuando nadie esté
// editando el catálogo. No es un backup de producción.
import { isDeepStrictEqual } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "catalog";
const PAGE = 1000;
const CHUNK = 500;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// En orden de inserción (respeta las llaves foráneas). `key` es la llave primaria: da un orden
// estable para paginar y para comparar origen y destino.
const TABLES = [
  { name: "catalog_settings", key: ["id"] },
  { name: "categories", key: ["id"] },
  { name: "colors", key: ["name"] },
  { name: "products", key: ["id"] },
  { name: "designs", key: ["product_id", "id"] },
  { name: "design_colors", key: ["product_id", "design_id", "color_name"] },
  { name: "design_stock", key: ["product_id", "design_id", "color_name", "size"] },
] as const;

type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;

const dryRun = process.argv.includes("--dry-run");

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`Falta la variable ${name} en .env.copy.local.`);
  return value;
}

function parseUrl(name: string): URL {
  try {
    return new URL(env(name));
  } catch {
    return fail(`${name} no es una URL válida.`);
  }
}

// `localhost` y `127.0.0.1` son el mismo servidor.
function identity(url: URL): string {
  return LOCAL_HOSTS.has(url.hostname) ? `local:${url.port}` : url.origin;
}

const readOnlyFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new Error(`Bloqueado: se intentó ${method} sobre el origen, que es de solo lectura.`);
  }
  return fetch(input, init);
};

function client(url: URL, key: string, readOnly: boolean): SupabaseClient {
  return createClient(url.origin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(readOnly ? { global: { fetch: readOnlyFetch } } : {}),
  });
}

// Lee una tabla completa. Se guía por el conteo total, porque el servidor puede limitar cada página.
async function readAll(supabase: SupabaseClient, table: Table, side: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (;;) {
    let query = supabase.from(table.name).select("*", { count: "exact" });
    for (const column of table.key) query = query.order(column);
    const { data, count, error } = await query.range(rows.length, rows.length + PAGE - 1);
    if (error) fail(`No se pudo leer ${table.name} en ${side}: ${error.message}`);
    rows.push(...(data as Row[]));
    if (rows.length >= (count ?? 0)) return rows;
    if (data.length === 0) fail(`La lectura de ${table.name} en ${side} quedó incompleta.`);
  }
}

async function countRows(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    fail(
      `No se pudo consultar ${table} en el destino: ${error.message || "sin respuesta"}. ` +
        "¿Está corriendo `npx supabase start`?",
    );
  }
  return count ?? 0;
}

function stockByProduct(rows: Row[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.product_id);
    totals.set(id, (totals.get(id) ?? 0) + Number(row.qty));
  }
  return totals;
}

async function copyPhotos(source: SupabaseClient, target: SupabaseClient, paths: string[]) {
  const failures: string[] = [];
  for (const [index, path] of paths.entries()) {
    try {
      const downloaded = await source.storage.from(BUCKET).download(path);
      if (downloaded.error) throw new Error(`descarga: ${downloaded.error.message}`);
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      const contentType = MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? downloaded.data.type;
      // upsert: tras un `db reset` pueden quedar archivos de una copia anterior.
      const uploaded = await target.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (uploaded.error) throw new Error(`subida: ${uploaded.error.message}`);
      console.log(`  ✔ ${index + 1}/${paths.length} ${path} (${(bytes.length / 1024).toFixed(0)} KB)`);
    } catch (error) {
      failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    fail(
      `No se pudieron copiar ${failures.length} fotos (no se escribió ninguna fila):\n${failures.join("\n")}`,
    );
  }
}

async function main() {
  const sourceUrl = parseUrl("SOURCE_SUPABASE_URL");
  const targetUrl = parseUrl("TARGET_SUPABASE_URL");
  if (!LOCAL_HOSTS.has(targetUrl.hostname)) {
    fail(`El destino debe ser local (127.0.0.1 o localhost); recibí ${targetUrl.hostname}.`);
  }
  if (identity(sourceUrl) === identity(targetUrl)) fail("El origen y el destino son el mismo.");

  const source = client(sourceUrl, env("SOURCE_SUPABASE_SERVICE_ROLE_KEY"), true);
  const target = client(targetUrl, env("TARGET_SUPABASE_SERVICE_ROLE_KEY"), false);

  console.log(dryRun ? "== DRY RUN: no se escribe nada ==" : "== COPIA ==");
  console.log(`Origen (solo lectura): ${sourceUrl.host}\nDestino (local):       ${targetUrl.host}\n`);

  // 1) El destino tiene que estar vacío.
  const occupied: string[] = [];
  for (const table of TABLES) {
    const total = await countRows(target, table.name);
    if (total > 0) occupied.push(`${table.name} (${total})`);
  }
  if (occupied.length > 0 && !dryRun) {
    fail(
      `El destino ya tiene datos: ${occupied.join(", ")}.\n` +
        "Si puedes perderlos, ejecuta `npx supabase db reset` y repite la copia.",
    );
  }

  // 2) Lectura del origen.
  const snapshot = new Map<Table["name"], Row[]>();
  for (const table of TABLES) snapshot.set(table.name, await readAll(source, table, "el origen"));
  const photos = [...new Set(snapshot.get("designs")!.map((row) => String(row.image_path)))];
  const stock = stockByProduct(snapshot.get("design_stock")!);

  console.table({
    ...Object.fromEntries(TABLES.map((table) => [table.name, snapshot.get(table.name)!.length])),
    "unidades en stock": [...stock.values()].reduce((a, b) => a + b, 0),
    "fotos distintas": photos.length,
  });

  if (dryRun) {
    if (occupied.length > 0) {
      console.log(`Aviso: el destino ya tiene datos (${occupied.join(", ")}); la copia real se negará.`);
    }
    console.log("Dry run terminado. No se escribió nada.");
    return;
  }

  // 3) Fotos primero: si alguna falla, las tablas quedan intactas.
  console.log("Copiando fotos…");
  await copyPhotos(source, target, photos);

  // 4) Filas.
  console.log("Copiando filas…");
  for (const table of TABLES) {
    const rows = snapshot.get(table.name)!;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await target.from(table.name).insert(rows.slice(i, i + CHUNK));
      if (error) {
        fail(
          `Error escribiendo ${table.name}: ${error.message}\n` +
            "La copia quedó incompleta: ejecuta `npx supabase db reset` antes de repetirla.",
        );
      }
    }
  }

  // 5) Verificación: cada fila, el stock por producto y cada foto.
  console.log("Verificando…");
  const problems: string[] = [];
  for (const table of TABLES) {
    const expected = snapshot.get(table.name)!;
    const actual = await readAll(target, table, "el destino");
    // El origen y el destino pueden ordenar el texto distinto: se compara por llave, no por posición.
    const keyOf = (row: Row) => JSON.stringify(table.key.map((column) => row[column]));
    const byKey = new Map(actual.map((row) => [keyOf(row), row]));
    const different = expected.filter((row) => !isDeepStrictEqual(row, byKey.get(keyOf(row)))).length;
    if (actual.length !== expected.length || different > 0) {
      problems.push(
        `${table.name}: origen ${expected.length} filas, destino ${actual.length}, distintas ${different}`,
      );
    }
    if (table.name === "design_stock") {
      const copied = stockByProduct(actual);
      for (const [id, total] of stock) {
        if (copied.get(id) !== total) {
          problems.push(`stock del producto ${id}: origen ${total}, destino ${copied.get(id) ?? 0}`);
        }
      }
    }
  }
  for (const path of photos) {
    const { data } = target.storage.from(BUCKET).getPublicUrl(path);
    const response = await fetch(data.publicUrl, { method: "HEAD" });
    if (!response.ok) problems.push(`foto ${path}: responde ${response.status}`);
  }

  if (problems.length > 0) fail(`La verificación encontró diferencias:\n${problems.join("\n")}`);
  console.log("\n✔ Copia completa y verificada. El origen solo se leyó.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
