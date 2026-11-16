// SPEC 12: copia una sola vez el catálogo de Redis (y sus fotos de Vercel Blob) a Supabase.
//
//   npx tsx --env-file=.env.local scripts/migrate-catalog-to-supabase.ts --dry-run
//   npx tsx --env-file=.env.local scripts/migrate-catalog-to-supabase.ts
//
// - Lee `overcity:catalog:v2` (o `v1`) con las mismas conversiones que usaba la app.
// - Es idempotente: las fotos van a una ruta determinista derivada de su URL original y las filas
//   se escriben con upsert (los hijos de cada producto se reemplazan). Ejecutarlo dos veces no
//   duplica filas ni archivos.
// - Nunca modifica ni borra nada en Redis ni en Blob.
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { migrateDesignsShape, migrateLegacyCatalog } from "../lib/catalog-legacy";
import { normalizeText, type Catalog } from "../lib/catalog-shared";
import { validateCatalog } from "../lib/catalog-validate";

const CATALOG_KEY = "overcity:catalog:v2";
const LEGACY_CATALOG_KEY = "overcity:catalog:v1";
const BUCKET = "catalog";
const CHUNK = 500;
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const dryRun = process.argv.includes("--dry-run");

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) fail(`Falta la variable ${name} (usa --env-file=.env.local).`);
  return value;
}

// Ruta determinista en el bucket: catalog/<sha1 de la URL original>.<ext>
function imagePathFor(url: string): string {
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
  const safeExt = ext in MIME ? ext : "png";
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 32);
  return `catalog/${hash}.${safeExt}`;
}

async function loadCatalog(): Promise<Catalog> {
  const redis = new Redis({ url: env("KV_REST_API_URL"), token: env("KV_REST_API_TOKEN") });
  const v2 = await redis.get<unknown>(CATALOG_KEY);
  let raw: unknown;
  let source: string;
  if (v2 !== null) {
    raw = migrateDesignsShape(v2);
    source = CATALOG_KEY;
  } else {
    const v1 = await redis.get<unknown>(LEGACY_CATALOG_KEY);
    if (v1 === null) fail("No hay catálogo en Redis (ni v2 ni v1).");
    raw = migrateDesignsShape(migrateLegacyCatalog(v1));
    source = LEGACY_CATALOG_KEY;
  }
  const result = validateCatalog(raw);
  if (!result.ok) fail(`El catálogo de Redis no es válido: ${result.error}`);
  console.log(`Origen: Redis ${source}`);
  return result.catalog;
}

function counts(catalog: Catalog) {
  const designs = catalog.products.flatMap((product) => product.designs);
  return {
    categorias: catalog.categories.length,
    colores: catalog.colors.length,
    productos: catalog.products.length,
    diseños: designs.length,
    "colores por diseño": designs.reduce((sum, design) => sum + design.colors.length, 0),
    "filas de stock": designs.reduce(
      (sum, design) =>
        sum + Object.values(design.stock).reduce((inner, row) => inner + Object.keys(row).length, 0),
      0,
    ),
  };
}

function productStock(product: Catalog["products"][number]): number {
  return product.designs.reduce(
    (total, design) =>
      total +
      Object.values(design.stock).reduce(
        (sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0),
        0,
      ),
    0,
  );
}

async function insertChunks(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  upsertOn?: string,
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const query = upsertOn
      ? supabase.from(table).upsert(slice, { onConflict: upsertOn })
      : supabase.from(table).insert(slice);
    const { error } = await query;
    if (error) fail(`Error escribiendo ${table}: ${error.message}`);
  }
}

async function existingStoragePaths(supabase: SupabaseClient): Promise<Set<string>> {
  const found = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list("catalog", { limit: 1000, offset });
    if (error) fail(`No se pudo listar Storage: ${error.message}`);
    for (const file of data) found.add(`catalog/${file.name}`);
    if (data.length < 1000) break;
  }
  return found;
}

async function main() {
  console.log(dryRun ? "== DRY RUN: no se escribe nada ==" : "== MIGRACIÓN REAL ==");
  const catalog = await loadCatalog();
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expected = counts(catalog);
  console.log("\nConteos en Redis:");
  console.table(expected);

  const urls = [...new Set(catalog.products.flatMap((p) => p.designs.map((d) => d.image)))];
  const pathByUrl = new Map(urls.map((url) => [url, imagePathFor(url)]));
  const already = await existingStoragePaths(supabase);
  const toCopy = urls.filter((url) => !already.has(pathByUrl.get(url)!));
  console.log(`\nFotos distintas: ${urls.length} · ya en Storage: ${urls.length - toCopy.length} · por copiar: ${toCopy.length}`);

  if (dryRun) {
    for (const url of toCopy) console.log(`  ${url}\n    → ${pathByUrl.get(url)}`);
    console.log("\nDry run terminado. No se escribió nada.");
    return;
  }

  // 1) Fotos: Blob → Storage. Si alguna falla, se aborta antes de tocar Postgres.
  const failures: string[] = [];
  for (const url of toCopy) {
    const path = pathByUrl.get(url)!;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const ext = path.split(".").pop()!;
      const contentType = MIME[ext] ?? "image/png";
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error(error.message);
      console.log(`  ✔ ${path} (${(bytes.length / 1024).toFixed(0)} KB)`);
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) fail(`No se pudieron copiar ${failures.length} fotos:\n${failures.join("\n")}`);

  // 2) Filas.
  const { error: settingsError } = await supabase.from("catalog_settings").upsert({
    id: 1,
    title: catalog.title,
    currency: catalog.currency,
    whatsapp: catalog.whatsapp,
    free_shipping_from: catalog.freeShippingFrom,
  });
  if (settingsError) fail(`Error escribiendo catalog_settings: ${settingsError.message}`);

  await insertChunks(
    supabase,
    "categories",
    catalog.categories.map((c, position) => ({
      id: c.id,
      name: c.name,
      one_size: c.oneSize,
      position,
    })),
    "id",
  );
  await insertChunks(
    supabase,
    "colors",
    catalog.colors.map((c, position) => ({
      name: c.name,
      name_key: normalizeText(c.name),
      hex: c.hex,
      hidden: c.hidden,
      position,
    })),
    "name",
  );
  // `version` no se envía: una fila nueva arranca en 1 y una existente conserva la suya.
  await insertChunks(
    supabase,
    "products",
    catalog.products.map((p, position) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      category_id: p.categoryId,
      visible: p.visible,
      position,
    })),
    "id",
  );

  // Los diseños, colores por diseño y stock de cada producto se reemplazan completos (cascada).
  const ids = catalog.products.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from("designs").delete().in("product_id", ids.slice(i, i + 100));
    if (error) fail(`Error limpiando designs: ${error.message}`);
  }
  const designRows: Record<string, unknown>[] = [];
  const colorRows: Record<string, unknown>[] = [];
  const stockRows: Record<string, unknown>[] = [];
  for (const product of catalog.products) {
    product.designs.forEach((design, position) => {
      designRows.push({
        product_id: product.id,
        id: design.id,
        name: design.name,
        name_key: normalizeText(design.name),
        image_path: pathByUrl.get(design.image),
        position,
      });
      design.colors.forEach((color, colorPosition) => {
        colorRows.push({
          product_id: product.id,
          design_id: design.id,
          color_name: color,
          position: colorPosition,
        });
        for (const [size, qty] of Object.entries(design.stock[color])) {
          stockRows.push({
            product_id: product.id,
            design_id: design.id,
            color_name: color,
            size,
            qty,
          });
        }
      });
    });
  }
  await insertChunks(supabase, "designs", designRows);
  await insertChunks(supabase, "design_colors", colorRows);
  await insertChunks(supabase, "design_stock", stockRows);

  // 3) Verificación.
  console.log("\nVerificando…");
  const count = async (table: string) => {
    const { count: total, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) fail(`No se pudo contar ${table}: ${error.message}`);
    return total ?? 0;
  };
  const actual = {
    categorias: await count("categories"),
    colores: await count("colors"),
    productos: await count("products"),
    diseños: await count("designs"),
    "colores por diseño": await count("design_colors"),
    "filas de stock": await count("design_stock"),
  };
  console.log("Conteos en Postgres:");
  console.table(actual);
  let ok = true;
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (expected[key] !== actual[key]) {
      ok = false;
      console.error(`✖ ${key}: Redis ${expected[key]} ≠ Postgres ${actual[key]}`);
    }
  }

  for (const product of catalog.products) {
    const { data, error } = await supabase
      .from("design_stock")
      .select("qty")
      .eq("product_id", product.id);
    if (error) fail(`No se pudo leer el stock: ${error.message}`);
    const total = data.reduce((sum, row) => sum + row.qty, 0);
    if (total !== productStock(product)) {
      ok = false;
      console.error(`✖ Stock de ${product.id}: Redis ${productStock(product)} ≠ Postgres ${total}`);
    }
  }

  for (const path of pathByUrl.values()) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const response = await fetch(data.publicUrl, { method: "HEAD" });
    if (response.status !== 200) {
      ok = false;
      console.error(`✖ ${path} responde ${response.status}`);
    }
  }

  if (!ok) fail("La verificación encontró diferencias.");
  console.log("\n✔ Migración completa y verificada. Redis y Blob quedaron intactos.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
