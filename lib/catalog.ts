import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  validateCategories,
  validateColors,
  validateProduct,
  validateSettings,
} from "@/lib/catalog-validate";
import {
  normalizeText,
  productColors,
  sortSizes,
  type CatalogCategory,
  type CatalogColorDef,
  type CatalogCurrency,
  type CatalogList,
  type CatalogProduct,
  type ColorUsageMap,
  type ProductCard,
  type VersionedProduct,
} from "@/lib/catalog-shared";
import { comboKey, reservedStockMessage } from "@/lib/orders-shared";
import { MAX_PRODUCTS } from "@/lib/content-limits";
import { catalogPublicBase, CATALOG_BUCKET, requireSupabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export * from "@/lib/catalog-validate";
export { CATALOG_CURRENCIES, formatPrice } from "@/lib/catalog-shared";
export type {
  Catalog,
  CatalogCategory,
  CatalogColor,
  CatalogColorDef,
  CatalogCurrency,
  CatalogDesign,
  CatalogProduct,
} from "@/lib/catalog-shared";

// Valores por defecto cuando todavía no hay fila de ajustes en Postgres.
const DEFAULT_TITLE = "Catálogo";
const DEFAULT_CURRENCY: CatalogCurrency = "COP";

// =====================================================================================================
// SPEC 12 — Capa de datos del catálogo sobre Postgres (Supabase). Redis ya no guarda el catálogo.
// =====================================================================================================

const IMAGE_PATH_PATTERN = /^catalog\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i;

// Una URL de foto es válida si apunta al bucket público del catálogo y a una ruta `catalog/<archivo>`.
export function isCatalogImageUrl(url: string): boolean {
  try {
    const base = catalogPublicBase();
    return url.startsWith(base) && IMAGE_PATH_PATTERN.test(url.slice(base.length));
  } catch {
    return false;
  }
}

export function catalogImagePath(url: string): string {
  return url.slice(catalogPublicBase().length);
}

function imageUrl(imagePath: string): string {
  return `${catalogPublicBase()}${imagePath}`;
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) {
    throw new Error(`No se pudo leer ${what}.`);
  }
  return result.data;
}

type Meta = {
  settings: Pick<CatalogList, "title" | "currency" | "whatsapp" | "freeShippingFrom">;
  categories: CatalogCategory[];
  colors: CatalogColorDef[];
};

async function readMeta(supabase: SupabaseClient): Promise<Meta> {
  const [settings, categories, colors] = await Promise.all([
    supabase
      .from("catalog_settings")
      .select("title,currency,whatsapp,free_shipping_from")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("categories").select("id,name,one_size").order("position"),
    supabase.from("colors").select("name,hex,hidden").order("position"),
  ]);
  if (settings.error) throw new Error("No se pudo leer los ajustes del catálogo.");
  const row = settings.data as {
    title: string;
    currency: CatalogCurrency;
    whatsapp: string;
    free_shipping_from: number | null;
  } | null;
  return {
    settings: {
      title: row?.title ?? DEFAULT_TITLE,
      currency: row?.currency ?? DEFAULT_CURRENCY,
      whatsapp: row?.whatsapp ?? "",
      freeShippingFrom: row?.free_shipping_from ?? null,
    },
    categories: (
      must(categories, "las categorías") as { id: string; name: string; one_size: boolean }[]
    ).map((c) => ({ id: c.id, name: c.name, oneSize: c.one_size })),
    colors: must(colors, "los colores") as CatalogColorDef[],
  };
}

type CardRow = {
  id: string;
  name: string;
  price: number | null;
  category_id: string | null;
  visible: boolean;
  cover_path: string | null;
  hover_path: string | null;
  design_count: number;
  cover_color: string | null;
  colors: string[];
  stock_total: number;
};

// Lista ligera: ajustes, categorías, colores y una tarjeta por producto (sin descripción ni stock).
// SPEC 17: con `discountReserved`, `stockTotal` es el disponible (físico − reservado).
export async function readCatalogList(
  onlyVisible: boolean,
  discountReserved = false,
): Promise<CatalogList> {
  const supabase = requireSupabase();
  const [meta, cards] = await Promise.all([
    readMeta(supabase),
    supabase.rpc("catalog_cards", {
      only_visible: onlyVisible,
      discount_reserved: discountReserved,
    }),
  ]);
  const rows = must(cards, "los productos") as CardRow[];
  const products: ProductCard[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    price: row.price,
    categoryId: row.category_id,
    cover: row.cover_path ? imageUrl(row.cover_path) : "",
    coverColor: row.cover_color,
    hoverImage: row.hover_path ? imageUrl(row.hover_path) : null,
    designCount: row.design_count,
    colors: productColors({ designs: [{ colors: row.colors }] }, meta.colors),
    stockTotal: row.stock_total,
    visible: row.visible,
  }));
  return { ...meta.settings, categories: meta.categories, colors: meta.colors, products };
}

type ProductJson = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  categoryId: string | null;
  visible: boolean;
  version: number;
  designs: {
    id: string;
    name: string;
    imagePath: string;
    colors: string[];
    stock: Record<string, Record<string, number>>;
  }[];
};

function toProduct(json: ProductJson): VersionedProduct {
  return {
    version: json.version,
    product: {
      id: json.id,
      name: json.name,
      description: json.description,
      price: json.price,
      categoryId: json.categoryId,
      visible: json.visible,
      designs: json.designs.map((design) => ({
        id: design.id,
        name: design.name,
        image: imageUrl(design.imagePath),
        colors: design.colors,
        // jsonb no conserva el orden: los colores siguen el orden del diseño y las tallas, XS a XL.
        stock: Object.fromEntries(
          design.colors.map((color) => [color, sortSizes(design.stock[color] ?? {})]),
        ),
      })),
    },
  };
}

// Productos completos por id (con diseños, colores y stock), en el orden de la tienda.
// SPEC 17: con `discountReserved`, las cantidades son el disponible; sin él, el stock físico.
export async function readProducts(
  ids: string[],
  onlyVisible: boolean,
  discountReserved = false,
): Promise<VersionedProduct[]> {
  if (ids.length === 0) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("catalog_products", {
    ids,
    only_visible: onlyVisible,
    discount_reserved: discountReserved,
  });
  if (error || !Array.isArray(data)) throw new Error("No se pudo leer los productos.");
  return (data as ProductJson[]).map(toProduct);
}

// ---- Lecturas públicas (con caché y etiqueta "catalog"; solo productos visibles) ----
// SPEC 17: muestran el disponible. Un congelamiento que vence no genera ningún evento, así que la
// caché se revalida cada minuto; los cambios hechos en el panel invalidan la etiqueta al momento.
const PUBLIC_CACHE = { stale: 300, revalidate: 60, expire: 86_400 };

export async function getPublicCatalogList(): Promise<CatalogList> {
  "use cache";
  cacheTag("catalog");
  cacheLife(PUBLIC_CACHE);
  return readCatalogList(true, true);
}

export async function getPublicProduct(id: string): Promise<CatalogProduct | null> {
  "use cache";
  cacheTag("catalog");
  cacheLife(PUBLIC_CACHE);
  const [found] = await readProducts([id], true, true);
  return found?.product ?? null;
}

// ---- Lecturas del panel (sin caché) ----

export async function getAdminCatalogList(): Promise<CatalogList> {
  return readCatalogList(false);
}

export async function getAdminProduct(id: string): Promise<VersionedProduct | null> {
  const [found] = await readProducts([id], false);
  return found ?? null;
}

// Unidades reservadas por combinación de un producto (clave de `comboKey`), para la ficha del panel.
export async function getAdminReserved(productId: string): Promise<Record<string, number>> {
  const rows = must(
    await requireSupabase().rpc("reserved_combos", { ids: [productId] }),
    "las reservas",
  ) as { product_id: string; design_id: string; color_name: string; size: string; reserved: number }[];
  return Object.fromEntries(
    rows.map((row) => [
      comboKey({
        productId: row.product_id,
        designId: row.design_id,
        color: row.color_name,
        size: row.size,
      }),
      row.reserved,
    ]),
  );
}

export async function getAdminCategories(): Promise<CatalogCategory[]> {
  return (await readMeta(requireSupabase())).categories;
}

async function readColorUsage(supabase: SupabaseClient): Promise<ColorUsageMap> {
  const rows = must(await supabase.rpc("catalog_color_usage"), "el uso de los colores") as {
    color_name: string;
    designs: number;
    products: number;
  }[];
  return Object.fromEntries(
    rows.map((row) => [row.color_name, { designs: row.designs, products: row.products }]),
  );
}

export async function getAdminColors(): Promise<{
  colors: CatalogColorDef[];
  usage: ColorUsageMap;
}> {
  const supabase = requireSupabase();
  const [meta, usage] = await Promise.all([readMeta(supabase), readColorUsage(supabase)]);
  return { colors: meta.colors, usage };
}

// Categorías, colores, moneda y número de productos: lo que necesita la ficha sin cargar la lista.
export async function getAdminEditorMeta(): Promise<{
  categories: CatalogCategory[];
  colors: CatalogColorDef[];
  currency: CatalogCurrency;
  productCount: number;
}> {
  const supabase = requireSupabase();
  const [meta, count] = await Promise.all([
    readMeta(supabase),
    supabase.from("products").select("id", { count: "exact", head: true }),
  ]);
  return {
    categories: meta.categories,
    colors: meta.colors,
    currency: meta.settings.currency,
    productCount: count.count ?? 0,
  };
}

export async function getAdminSettings(): Promise<Meta["settings"]> {
  return (await readMeta(requireSupabase())).settings;
}

// ---- Escrituras (RPC transaccionales) ----

export type WriteResult =
  | { ok: true; version?: number; product?: CatalogProduct }
  | { ok: false; error: string };

type RpcResult = { ok: boolean; error?: string; version?: number; orders?: number[] };

export const CONFLICT_MESSAGE =
  "Este producto cambió desde que abriste la ficha. Recarga para ver la versión nueva.";

async function rpc(supabase: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error || typeof data !== "object" || data === null) {
    throw new Error("No se pudo guardar. Intenta de nuevo.");
  }
  return data as RpcResult;
}

function failure(error: string | undefined, orders: number[] = []): WriteResult {
  switch (error) {
    case "reserved_stock":
      return { ok: false, error: reservedStockMessage(orders) };
    case "conflict":
      return { ok: false, error: CONFLICT_MESSAGE };
    case "not_found":
      return { ok: false, error: "El producto no existe." };
    case "duplicate_design":
      return { ok: false, error: "El producto ya tiene un diseño con ese nombre." };
    case "duplicate_color":
      return { ok: false, error: "Ya existe un color con ese nombre." };
    case "invalid_reference":
    case "invalid_value":
      return { ok: false, error: "Hay datos inválidos en el producto." };
    default:
      return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}

// Borra de Storage las fotos que no referencian ni `designs` ni las líneas de pedidos (SPEC 17: el
// historial no se queda sin miniaturas). Se llama después de confirmar la RPC. Ante un error de
// lectura no borra nada.
export async function deleteUnreferencedImages(paths: string[]): Promise<void> {
  const unique = [...new Set(paths)].filter((path) => IMAGE_PATH_PATTERN.test(path));
  if (unique.length === 0) return;
  try {
    const supabase = requireSupabase();
    // Una consulta por foto: con `in` sobre todas, las líneas repetidas podrían pasar del tope de
    // filas de PostgREST y dejar fuera una foto en uso.
    const checks = await Promise.all(
      unique.map(async (path) => {
        const results = await Promise.all(
          ["designs", "order_items"].map((table) =>
            supabase.from(table).select("image_path").eq("image_path", path).limit(1),
          ),
        );
        return results.every(({ data, error }) => !error && data?.length === 0) ? path : null;
      }),
    );
    const stale = checks.filter((path): path is string => path !== null);
    if (stale.length > 0) await supabase.storage.from(CATALOG_BUCKET).remove(stale);
  } catch {
    // Un archivo huérfano no debe romper el guardado.
  }
}

async function productImagePaths(supabase: SupabaseClient, id: string): Promise<string[]> {
  const { data } = await supabase.from("designs").select("image_path").eq("product_id", id);
  return ((data ?? []) as { image_path: string }[]).map((row) => row.image_path);
}

// Crea (expectedVersion null) o actualiza un producto con sus diseños, colores y stock.
export async function writeProduct(
  input: unknown,
  expectedVersion: number | null,
): Promise<WriteResult> {
  const supabase = requireSupabase();
  const meta = await readMeta(supabase);
  const checked = validateProduct(input, { ...meta, imageOk: isCatalogImageUrl });
  if (!checked.ok) return checked;
  const product = checked.value;

  if (expectedVersion === null) {
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_PRODUCTS) {
      return { ok: false, error: `No puede haber más de ${MAX_PRODUCTS} productos.` };
    }
  }
  const before = expectedVersion === null ? [] : await productImagePaths(supabase, product.id);

  const payload = {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    categoryId: product.categoryId,
    visible: product.visible,
    designs: product.designs.map((design) => ({
      id: design.id,
      name: design.name,
      nameKey: normalizeText(design.name),
      imagePath: catalogImagePath(design.image),
      colors: design.colors,
      stock: design.stock,
    })),
  };
  const result = await rpc(supabase, "save_product", {
    payload,
    expected_version: expectedVersion,
  });
  if (!result.ok) return failure(result.error, result.orders);
  await deleteUnreferencedImages(before);
  return { ok: true, version: result.version, product };
}

export async function removeProduct(id: string): Promise<WriteResult> {
  const supabase = requireSupabase();
  const before = await productImagePaths(supabase, id);
  const result = await rpc(supabase, "delete_product", { id });
  if (!result.ok) return failure(result.error, result.orders);
  await deleteUnreferencedImages(before);
  return { ok: true };
}

export async function writeProductVisible(id: string, visible: boolean): Promise<WriteResult> {
  const result = await rpc(requireSupabase(), "set_product_visible", { id, visible });
  return result.ok ? { ok: true, version: result.version } : failure(result.error);
}

export async function writeProductMove(id: string, offset: -1 | 1): Promise<WriteResult> {
  const result = await rpc(requireSupabase(), "move_product", { id, offset });
  return result.ok ? { ok: true } : failure(result.error);
}

export async function writeCategories(input: unknown): Promise<WriteResult> {
  const checked = validateCategories(input);
  if (!checked.ok) return checked;
  const result = await rpc(requireSupabase(), "save_categories", { items: checked.value });
  return result.ok ? { ok: true } : failure(result.error, result.orders);
}

function colorInUseMessage(name: string, designs: number, products: number): string {
  return `No se puede eliminar «${name}»: está en ${designs} ${
    designs === 1 ? "diseño" : "diseños"
  } de ${products} ${products === 1 ? "producto" : "productos"}. Puedes ocultarlo.`;
}

export async function writeColors(input: unknown): Promise<WriteResult> {
  const checked = validateColors(input);
  if (!checked.ok) return checked;
  const supabase = requireSupabase();
  const [current, usage] = await Promise.all([readMeta(supabase), readColorUsage(supabase)]);
  const kept = new Set(checked.value.map((color) => color.name));
  for (const old of current.colors) {
    const used = usage[old.name];
    if (!kept.has(old.name) && used && used.designs > 0) {
      return { ok: false, error: colorInUseMessage(old.name, used.designs, used.products) };
    }
  }
  const items = checked.value.map((color) => ({ ...color, nameKey: normalizeText(color.name) }));
  const result = await rpc(supabase, "save_colors", { items });
  if (result.ok) return { ok: true };
  if (result.error === "color_in_use") {
    // Otro administrador empezó a usar el color entre la comprobación y el guardado.
    const fresh = await readColorUsage(supabase);
    const blocked = current.colors.find((old) => !kept.has(old.name) && fresh[old.name]);
    if (blocked) {
      return {
        ok: false,
        error: colorInUseMessage(
          blocked.name,
          fresh[blocked.name].designs,
          fresh[blocked.name].products,
        ),
      };
    }
  }
  return failure(result.error);
}

export async function writeSettings(input: unknown): Promise<WriteResult> {
  const checked = validateSettings(input);
  if (!checked.ok) return checked;
  const result = await rpc(requireSupabase(), "save_settings", { payload: checked.value });
  return result.ok ? { ok: true } : failure(result.error);
}
