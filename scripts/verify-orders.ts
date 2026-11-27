// Verifica en una base real las reglas de pedidos (SPEC 17): atomicidad, concurrencia y protecciones.
// Crea sus propios datos, lanza operaciones simultáneas por RPC, comprueba y limpia.
//
// NUNCA contra producción: úsalo con el Supabase local o un proyecto de pruebas aparte, con
// 0001 y 0002 aplicadas. No corre sin ORDERS_VERIFY_ALLOW=1.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ORDERS_VERIFY_ALLOW=1 npx tsx scripts/verify-orders.ts
//
// Con SUPABASE_ANON_KEY además comprueba que `anon` no puede leer las tablas ni ejecutar funciones.
// Mientras corre añade y quita una categoría y un color de prueba.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROUNDS = 5; // repeticiones de cada carrera
const SIZES = ["XS", "S", "M", "L", "XL"];

if (process.env.ORDERS_VERIFY_ALLOW !== "1") {
  console.error("✖ No se ejecuta sin ORDERS_VERIFY_ALLOW=1. Solo contra una base de pruebas.");
  process.exit(1);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✖ Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(url, key, options);
const actor = { sub: "verify-orders", name: "Verificación" };

const tag = randomUUID().slice(0, 8);
const color = `ZZ ${tag}`;
const created = { products: [] as string[], orders: [] as string[], requests: [] as string[], proofs: [] as string[] };

type Result = {
  ok: boolean;
  error?: string;
  version?: number;
  shortages?: { requested: number; available: number }[];
  orders?: number[];
  notRestored?: { size: string }[];
  previousPath?: string | null;
};

// Un error de la petición (p. ej. un interbloqueo, 40P01) hace fallar la verificación.
async function rpc(name: string, args: Record<string, unknown>): Promise<Result> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.code} ${error.message}`);
  return data as Result;
}

async function ok(name: string, args: Record<string, unknown>): Promise<Result> {
  const result = await rpc(name, args);
  assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
  return result;
}

async function rejected(name: string, args: Record<string, unknown>, error: string): Promise<Result> {
  const result = await rpc(name, args);
  assert.deepEqual([result.ok, result.error], [false, error], `${name}: ${JSON.stringify(result)}`);
  return result;
}

// ---- Datos de prueba ----

function productPayload(id: string, stock: Record<string, number>, categoryId: string | null = null) {
  return {
    id,
    name: `ZZ verificación ${tag}`,
    description: "",
    price: 1000,
    categoryId,
    visible: true,
    designs: [
      {
        id: "d1",
        name: "Uno",
        nameKey: "uno",
        imagePath: `catalog/zz-${tag}.png`,
        colors: [color],
        stock: { [color]: Object.fromEntries(Object.entries(stock)) },
      },
    ],
  };
}

const allSizes = (units: number) => Object.fromEntries(SIZES.map((size) => [size, units]));
const only = (m: number) => ({ ...allSizes(0), M: m });

async function newProduct(stock: Record<string, number>, categoryId: string | null = null) {
  const id = `zz-${tag}-${randomUUID()}`;
  created.products.push(id);
  await ok("save_product", { payload: productPayload(id, stock, categoryId), expected_version: null });
  return id;
}

const line = (productId: string, qty: number, size = "M", unitPrice: number | null = 1000) => ({
  productId,
  designId: "d1",
  color,
  size,
  qty,
  unitPrice,
});

type Line = ReturnType<typeof line>;

function orderPayload(id: string, lines: Line[], extra: Record<string, unknown> = {}) {
  return {
    id,
    requestCode: null,
    customerName: "Cliente de prueba",
    customerPhone: "3000000000",
    customerAddress: "",
    note: "",
    discount: 0,
    shipping: 0,
    lines,
    ...extra,
  };
}

async function newOrder(lines: Line[], extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  created.orders.push(id);
  await ok("save_order", { payload: orderPayload(id, lines, extra), expected_version: null, actor });
  return id;
}

async function readOrder(id: string) {
  const { data, error } = await db.from("orders").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as {
    number: number;
    status: string;
    version: number;
    frozen_until: string | null;
    request_code: string | null;
  };
}

async function stockOf(productId: string, size = "M"): Promise<number | null> {
  const { data, error } = await db
    .from("design_stock")
    .select("qty")
    .match({ product_id: productId, design_id: "d1", color_name: color, size })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { qty: number } | null)?.qty ?? null;
}

async function productVersion(id: string): Promise<number> {
  const { data, error } = await db.from("products").select("version").eq("id", id).single();
  if (error) throw new Error(error.message);
  return (data as { version: number }).version;
}

async function publicStock(productId: string): Promise<number> {
  const { data, error } = await db.rpc("catalog_products", {
    ids: [productId],
    only_visible: false,
    discount_reserved: true,
  });
  if (error) throw new Error(error.message);
  return data[0].designs[0].stock[color].M;
}

async function cardStock(productId: string, discount: boolean): Promise<number> {
  const { data, error } = await db.rpc("catalog_cards", {
    only_visible: false,
    discount_reserved: discount,
  });
  if (error) throw new Error(error.message);
  return (data as { id: string; stock_total: number }[]).find((row) => row.id === productId)!
    .stock_total;
}

const freeze = async (id: string, hours = 48) =>
  rpc("freeze_order", { id, hours, expected_version: (await readOrder(id)).version, actor });

const sellArgs = (id: string, version: number, method = "efectivo") => ({
  id,
  payment: { method, note: "" },
  expected_version: version,
  actor,
});

const sell = async (id: string) => rpc("sell_order", sellArgs(id, (await readOrder(id)).version));

function oneWinner(results: Result[], loserError: string) {
  assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
  assert.equal(results.find((r) => !r.ok)!.error, loserError, JSON.stringify(results));
}

// ---- Casos ----

const cases: [string, () => Promise<void>][] = [
  [
    "dos ventas simultáneas de la última unidad",
    async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const product = await newProduct(only(1));
        const orders = [await newOrder([line(product, 1)]), await newOrder([line(product, 1)])];
        oneWinner(await Promise.all(orders.map(sell)), "insufficient_stock");
        assert.equal(await stockOf(product), 0);
      }
    },
  ],
  [
    "dos congelamientos simultáneos de la última unidad",
    async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const product = await newProduct(only(1));
        const orders = [await newOrder([line(product, 1)]), await newOrder([line(product, 1)])];
        oneWinner(await Promise.all(orders.map((id) => freeze(id))), "insufficient_stock");
        assert.equal(await publicStock(product), 0);
        assert.equal(await stockOf(product), 1, "congelar no cambia el stock físico");
      }
    },
  ],
  [
    "venta doble del mismo pedido",
    async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const product = await newProduct(only(5));
        const id = await newOrder([line(product, 2)]);
        const args = sellArgs(id, 1);
        oneWinner(await Promise.all([rpc("sell_order", args), rpc("sell_order", args)]), "conflict");
        assert.equal(await stockOf(product), 3);
      }
    },
  ],
  [
    "venta y guardado de la ficha a la vez",
    async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const product = await newProduct(only(5));
        const id = await newOrder([line(product, 2)]);
        const opened = await productVersion(product);
        const [sale, save] = await Promise.all([
          rpc("sell_order", sellArgs(id, 1)),
          rpc("save_product", { payload: productPayload(product, only(5)), expected_version: opened }),
        ]);
        assert.equal(sale.ok, true, JSON.stringify(sale));
        if (!save.ok) assert.equal(save.error, "conflict");
        assert.equal(await stockOf(product), 3, "la ficha no puede restaurar lo vendido");
      }
      // Una ficha abierta antes de la venta responde siempre con conflicto.
      const product = await newProduct(only(5));
      const opened = await productVersion(product);
      assert.equal((await sell(await newOrder([line(product, 1)]))).ok, true);
      await rejected(
        "save_product",
        { payload: productPayload(product, only(5)), expected_version: opened },
        "conflict",
      );
    },
  ],
  [
    "mismos productos en orden inverso, sin interbloqueo",
    async () => {
      const [a, b] = [await newProduct(only(100)), await newProduct(only(100))];
      for (let i = 0; i < ROUNDS * 2; i++) {
        const first = await newOrder([line(a, 1), line(b, 1)]);
        const second = await newOrder([line(b, 1), line(a, 1)]);
        const frozen = await Promise.all([freeze(first), freeze(second)]);
        assert.ok(frozen.every((r) => r.ok), JSON.stringify(frozen));
        const sold = await Promise.all([sell(first), sell(second)]);
        assert.ok(sold.every((r) => r.ok), JSON.stringify(sold));
      }
      assert.equal(await stockOf(a), 100 - ROUNDS * 4);
      assert.equal(await stockOf(b), 100 - ROUNDS * 4);
    },
  ],
  [
    "venta de varias líneas con una sin stock: no se descuenta ninguna",
    async () => {
      const [a, b] = [await newProduct(only(5)), await newProduct(only(1))];
      const id = await newOrder([line(a, 2), line(b, 3)]);
      const versions = [await productVersion(a), await productVersion(b)];
      const result = await sell(id);
      assert.equal(result.error, "insufficient_stock");
      assert.deepEqual(
        result.shortages!.map((s) => [s.requested, s.available]),
        [[3, 1]],
      );
      assert.deepEqual([await stockOf(a), await stockOf(b)], [5, 1]);
      assert.deepEqual([await productVersion(a), await productVersion(b)], versions);
      assert.equal((await readOrder(id)).status, "abierto");
      // Congelar también es todo o nada.
      assert.equal((await freeze(id)).error, "insufficient_stock");
      assert.equal((await readOrder(id)).frozen_until, null);
      assert.equal(await publicStock(a), 5);
    },
  ],
  [
    "no se venden unidades reservadas por otro pedido",
    async () => {
      const product = await newProduct(only(3));
      const holder = await newOrder([line(product, 2)]);
      const other = await newOrder([line(product, 2)]);
      assert.equal((await freeze(holder)).ok, true);
      assert.equal((await sell(other)).error, "insufficient_stock");
      assert.equal((await sell(holder)).ok, true);
      assert.equal(await stockOf(product), 1);
    },
  ],
  [
    "un congelamiento vencido libera las unidades sin ninguna acción",
    async () => {
      const product = await newProduct(only(1));
      const expired = await newOrder([line(product, 1)]);
      const other = await newOrder([line(product, 1)]);
      assert.equal((await freeze(expired, 1)).ok, true);
      assert.equal(await publicStock(product), 0);
      assert.equal((await freeze(other)).error, "insufficient_stock");
      const past = new Date(Date.now() - 60_000).toISOString();
      await db.from("orders").update({ frozen_until: past }).eq("id", expired);
      assert.equal(await publicStock(product), 1);
      assert.equal(await cardStock(product, true), 1);
      assert.equal((await freeze(other)).ok, true);
      // Editar el vencido lo trata como no congelado (admite más que el disponible).
      const current = await readOrder(expired);
      await ok("save_order", {
        payload: orderPayload(expired, [line(product, 4)]),
        expected_version: current.version,
        actor,
      });
      assert.equal((await readOrder(expired)).frozen_until, null);
    },
  ],
  [
    "editar un pedido congelado es todo o nada y no cambia el vencimiento",
    async () => {
      const product = await newProduct(only(3));
      const id = await newOrder([line(product, 1)]);
      assert.equal((await freeze(id)).ok, true);
      const before = await readOrder(id);
      await rejected(
        "save_order",
        { payload: orderPayload(id, [line(product, 4)]), expected_version: before.version, actor },
        "insufficient_stock",
      );
      assert.equal(await publicStock(product), 2);
      await ok("save_order", {
        payload: orderPayload(id, [line(product, 3)]),
        expected_version: before.version,
        actor,
      });
      assert.equal((await readOrder(id)).frozen_until, before.frozen_until);
      assert.equal(await publicStock(product), 0);
      const version = (await readOrder(id)).version;
      await ok("release_order", { id, expected_version: version, actor });
      assert.equal(await publicStock(product), 3);
    },
  ],
  [
    "totales, líneas inválidas y copias tomadas del catálogo",
    async () => {
      const product = await newProduct(only(1));
      const id = randomUUID();
      created.orders.push(id);
      const save = (lines: unknown[], extra = {}) => ({
        payload: orderPayload(id, lines as Line[], extra),
        expected_version: null,
        actor,
      });
      await rejected("save_order", save([line(product, 1)], { discount: 1001 }), "invalid_discount");
      await rejected("save_order", save([line(product, 1, "XXL")]), "invalid_line");
      await rejected("save_order", save([line(product, 1), line(product, 1)]), "duplicate_line");
      // Sin congelar admite más que el disponible; los nombres enviados se ignoran.
      await ok("save_order", save([{ ...line(product, 9), productName: "Falso" }]));
      const { data } = await db.from("order_items").select("product_name").eq("order_id", id);
      assert.equal(data![0].product_name, `ZZ verificación ${tag}`);
      await rejected("freeze_order", { id, hours: 721, expected_version: 1, actor }, "invalid_hours");
      await rejected("freeze_order", { id, hours: 48, expected_version: 9, actor }, "conflict");
    },
  ],
  [
    "para vender faltan cliente, método o precios",
    async () => {
      const product = await newProduct(only(5));
      const anonymous = await newOrder([line(product, 1)], { customerPhone: "" });
      await rejected("sell_order", sellArgs(anonymous, 1), "missing_customer");
      const unpriced = await newOrder([line(product, 1, "M", null)]);
      await rejected("sell_order", sellArgs(unpriced, 1), "missing_price");
      const valid = await newOrder([line(product, 1)]);
      await rejected("sell_order", sellArgs(valid, 1, "cheque"), "invalid_payment");
      assert.equal(await stockOf(product), 5);
    },
  ],
  [
    "el catálogo no deja el stock bajo lo reservado; ocultar sí",
    async () => {
      const { data: rows } = await db.from("categories").select("id,name,one_size").order("position");
      const current = (rows ?? []).map((c) => ({ id: c.id, name: c.name, oneSize: c.one_size }));
      const test = { id: `zz-cat-${tag}`, name: `ZZ ${tag}`, oneSize: false };
      await ok("save_categories", { items: [...current, test] });
      try {
        const product = await newProduct(only(3), test.id);
        const id = await newOrder([line(product, 2)]);
        assert.equal((await freeze(id)).ok, true);
        const number = (await readOrder(id)).number;
        const version = await productVersion(product);
        const save = (payload: unknown) => ({ payload, expected_version: version });

        const lower = await rejected(
          "save_product",
          save(productPayload(product, only(1), test.id)),
          "reserved_stock",
        );
        assert.deepEqual(lower.orders, [number]);
        const withoutSize = Object.fromEntries(Object.entries(only(3)).filter(([s]) => s !== "M"));
        await rejected("save_product", save(productPayload(product, withoutSize, test.id)), "reserved_stock");
        await rejected("delete_product", { id: product }, "reserved_stock");
        await rejected(
          "save_categories",
          { items: [...current, { ...test, oneSize: true }] },
          "reserved_stock",
        );
        assert.equal(await stockOf(product), 3);
        await ok("set_product_visible", { id: product, visible: false });
        await ok("save_product", {
          payload: productPayload(product, only(2), test.id),
          expected_version: await productVersion(product),
        });
        await ok("release_order", { id, expected_version: (await readOrder(id)).version, actor });

        // Talla única reservada: borrar su categoría la haría desaparecer.
        await ok("save_categories", { items: [...current, { ...test, oneSize: true }] });
        const unique = await newOrder([line(product, 1, "Única")]);
        assert.equal((await freeze(unique)).ok, true);
        await rejected("save_categories", { items: current }, "reserved_stock");
        await ok("release_order", {
          id: unique,
          expected_version: (await readOrder(unique)).version,
          actor,
        });
        await ok("delete_product", { id: product });
      } finally {
        await db.from("categories").delete().eq("id", test.id);
      }
    },
  ],
  [
    "anular devuelve las unidades una sola vez e informa lo que no se restauró",
    async () => {
      const [a, b] = [await newProduct(only(5)), await newProduct(only(5))];
      const id = await newOrder([line(a, 2), line(b, 1)]);
      assert.equal((await sell(id)).ok, true);
      const sold = await readOrder(id);
      await rejected(
        "save_order",
        { payload: orderPayload(id, [line(a, 1)]), expected_version: sold.version, actor },
        "not_open",
      );
      await rejected("cancel_order", { id, expected_version: sold.version, actor }, "not_open");
      await rejected("void_order", { id, reason: " ", expected_version: sold.version, actor }, "invalid_reason");
      await ok("delete_product", { id: b });
      const version = await productVersion(a);
      const args = { id, reason: "Prueba", expected_version: sold.version, actor };
      const results = await Promise.all([rpc("void_order", args), rpc("void_order", args)]);
      oneWinner(results, "conflict");
      assert.equal(results.find((r) => r.ok)!.notRestored!.length, 1);
      assert.equal(await stockOf(a), 5);
      assert.equal(await productVersion(a), version + 1);
      assert.equal((await readOrder(id)).status, "anulado");
      const { data } = await db.from("order_events").select("type,actor_name").eq("order_id", id).order("id");
      assert.deepEqual(data!.map((e) => e.type), ["creado", "vendido", "anulado"]);
      assert.ok(data!.every((e) => e.actor_name === actor.name));
    },
  ],
  [
    "una solicitud se convierte una sola vez y se purga a los 30 días",
    async () => {
      const product = await newProduct(only(5));
      const code = "OC-ZZ" + "23456789ABCDEFGHJKMNPQRSTUVWXYZ".slice(0, 3);
      await db.from("order_requests").delete().eq("code", code);
      created.requests.push(code);
      const payload = { code, currency: "COP", lines: [] };
      await ok("create_order_request", { payload });
      await rejected("create_order_request", { payload }, "code_taken");
      assert.equal(await stockOf(product), 5, "una solicitud no toca el stock");

      const ids = [randomUUID(), randomUUID()];
      created.orders.push(...ids);
      const results = await Promise.all(
        ids.map((id) =>
          rpc("save_order", {
            payload: orderPayload(id, [line(product, 1)], { requestCode: code }),
            expected_version: null,
            actor,
          }),
        ),
      );
      oneWinner(results, "request_unavailable");
      const winner = ids[results.findIndex((r) => r.ok)];
      await rejected("discard_order_request", { code }, "request_unavailable");

      const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
      await db.from("order_requests").update({ created_at: old }).eq("code", code);
      const next = "OC-ZZ999";
      created.requests.push(next);
      await db.from("order_requests").delete().eq("code", next);
      await ok("create_order_request", { payload: { ...payload, code: next } });
      const { data } = await db.from("order_requests").select("code").eq("code", code);
      assert.equal(data!.length, 0);
      assert.equal((await readOrder(winner)).request_code, code);
      await ok("discard_order_request", { code: next });
    },
  ],
  [
    "comprobante: bucket privado, URL firmada que caduca y reglas de reemplazo",
    async () => {
      const product = await newProduct(only(5));
      const cash = await newOrder([line(product, 1)]);
      await rejected(
        "set_order_proof",
        { id: cash, path: `proofs/${cash}/a.png`, expected_version: 1, actor },
        "not_sold",
      );
      await ok("sell_order", sellArgs(cash, 1));
      await rejected(
        "set_order_proof",
        { id: cash, path: `proofs/${cash}/a.png`, expected_version: 2, actor },
        "invalid_proof",
      );

      const id = await newOrder([line(product, 1)]);
      await ok("sell_order", sellArgs(id, 1, "transferencia"));
      await rejected(
        "set_order_proof",
        { id, path: `proofs/${cash}/a.png`, expected_version: 2, actor },
        "invalid_proof",
      );
      const first = `proofs/${id}/${randomUUID()}.png`;
      created.proofs.push(first);
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      );
      const bucket = db.storage.from("payment-proofs");
      const upload = await bucket.upload(first, bytes, { contentType: "image/png" });
      assert.equal(upload.error, null, upload.error?.message);
      const wrongType = await bucket.upload(`proofs/${id}/x.pdf`, bytes, { contentType: "application/pdf" });
      assert.ok(wrongType.error, "el bucket rechaza otros tipos");
      assert.equal((await fetch(bucket.getPublicUrl(first).data.publicUrl)).ok, false);
      const signed = await bucket.createSignedUrl(first, 2);
      assert.equal((await fetch(signed.data!.signedUrl)).status, 200);
      await new Promise((resolve) => setTimeout(resolve, 4000));
      assert.equal((await fetch(signed.data!.signedUrl, { cache: "no-store" })).ok, false);

      await ok("set_order_proof", { id, path: first, expected_version: 2, actor });
      const replaced = await ok("set_order_proof", {
        id,
        path: `proofs/${id}/b.png`,
        expected_version: 3,
        actor,
      });
      assert.equal(replaced.previousPath, first);
      await ok("void_order", { id, reason: "Prueba", expected_version: 4, actor });
      await rejected(
        "set_order_proof",
        { id, path: first, expected_version: 5, actor },
        "not_sold",
      );
    },
  ],
  [
    "la lista del panel calcula totales y filtra",
    async () => {
      const product = await newProduct(only(5));
      const id = await newOrder([line(product, 2)], {
        customerName: `Ñandú ${tag}`,
        discount: 500,
        shipping: 100,
      });
      const { number } = await readOrder(id);
      for (const search of [`nandu ${tag}`, String(number), `#${number}`]) {
        const { data, error } = await db.rpc("order_list", { status_filter: "abierto", search });
        assert.equal(error, null, error?.message);
        const found = (data as { id: string; total: number }[]).find((row) => row.id === id);
        assert.equal(found?.total, 1600, search);
      }
      const frozen = await db.rpc("order_list", { status_filter: "congelado", search: tag });
      assert.equal(frozen.data.length, 0);
    },
  ],
];

const anonKey = process.env.SUPABASE_ANON_KEY;
if (anonKey) {
  cases.push([
    "anon no puede leer las tablas ni ejecutar las funciones",
    async () => {
      const anon = createClient(url, anonKey, options);
      for (const table of ["orders", "order_items", "order_events", "order_requests"]) {
        const { error } = await anon.from(table).select("*").limit(1);
        assert.equal(error?.code, "42501", table);
      }
      const id = randomUUID();
      const calls: [string, Record<string, unknown>][] = [
        ["create_order_request", { payload: {} }],
        ["discard_order_request", { code: "OC-22222" }],
        ["save_order", { payload: {}, expected_version: null, actor }],
        ["freeze_order", { id, hours: 1, expected_version: 1, actor }],
        ["release_order", { id, expected_version: 1, actor }],
        ["cancel_order", { id, expected_version: 1, actor }],
        ["sell_order", sellArgs(id, 1)],
        ["void_order", { id, reason: "x", expected_version: 1, actor }],
        ["set_order_proof", { id, path: "x", expected_version: 1, actor }],
        ["order_list", {}],
        ["combo_stock", { ids: [] }],
        ["reserved_combos", { ids: [] }],
        ["catalog_cards", {}],
        ["catalog_products", { ids: [] }],
      ];
      for (const [name, args] of calls) {
        const { error } = await anon.rpc(name, args);
        assert.equal(error?.code, "42501", `${name}: ${error?.code} ${error?.message}`);
      }
    },
  ]);
}

async function cleanup() {
  if (created.orders.length) await db.from("orders").delete().in("id", created.orders);
  // Por si quedó algún pedido de una ejecución interrumpida a mitad de un caso.
  if (created.requests.length) {
    await db.from("order_requests").delete().in("code", created.requests);
  }
  if (created.products.length) await db.from("products").delete().in("id", created.products);
  if (created.proofs.length) await db.storage.from("payment-proofs").remove(created.proofs);
  await db.from("colors").delete().eq("name", color);
}

async function main() {
  console.log(`Verificando pedidos en ${new URL(url!).host}`);
  const inserted = await db
    .from("colors")
    .insert({ name: color, name_key: color.toLowerCase(), hex: "#123456", hidden: true, position: 999 });
  if (inserted.error) throw new Error(`No se pudo crear el color de prueba: ${inserted.error.message}`);
  let failures = 0;
  try {
    for (const [name, run] of cases) {
      try {
        await run();
        console.log(`✔ ${name}`);
      } catch (error) {
        failures += 1;
        console.error(`✖ ${name}\n  ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await cleanup();
  }
  if (!anonKey) console.log("(sin SUPABASE_ANON_KEY: no se comprobó el acceso de anon)");
  console.log(failures ? `\n${failures} caso(s) fallaron.` : `\n${cases.length} casos correctos.`);
  process.exit(failures ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
