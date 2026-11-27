import "server-only";
import { can, getSession } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import {
  getAdminCatalogList,
  getAdminColors,
  getAdminEditorMeta,
  getAdminProduct,
  getAdminReserved,
  getAdminSettings,
} from "@/lib/catalog";
import type { CatalogList } from "@/lib/catalog-shared";
import { getContent, type SiteContent } from "@/lib/content";
import {
  draftFromRequest,
  readOrder,
  readOrderList,
  readRequest,
  readRequests,
} from "@/lib/orders";

// SPEC 13: cada loader exige el permiso de su pantalla y devuelve null si no se tiene (o no hay
// sesión): no se entrega ningún dato. El layout distingue "sin sesión" (pantalla de entrada) y la
// página muestra "Sin permiso" cuando el loader devuelve null con sesión.
async function allowed(permission: Permission): Promise<boolean> {
  return can(await getSession(), permission);
}

// Lista ligera del catálogo (todos los productos, sin stock ni descripciones) para el panel.
export async function loadAdminList(): Promise<CatalogList | null> {
  if (!(await allowed("catalogo.productos.editar"))) return null;
  return getAdminCatalogList();
}

// La pantalla de categorías usa su propio permiso (no el de productos).
export async function loadAdminCategories(): Promise<CatalogList | null> {
  if (!(await allowed("catalogo.categorias.editar"))) return null;
  return getAdminCatalogList();
}

export async function loadAdminColors() {
  if (!(await allowed("catalogo.colores.editar"))) return null;
  return getAdminColors();
}

export async function loadAdminSettings() {
  if (!(await allowed("catalogo.ajustes.editar"))) return null;
  return getAdminSettings();
}

// Ficha del panel: categorías, colores y moneda, más el producto con su versión (null = no existe).
// Los metadatos se leen con el permiso de productos.
export async function loadAdminEditor(id: string) {
  if (!(await allowed("catalogo.productos.editar"))) return null;
  const meta = await getAdminEditorMeta();
  if (id === "nuevo") return { meta, entry: null, reserved: {}, isNew: true as const };
  // SPEC 17: unidades reservadas por combinación, junto al stock físico.
  const [entry, reserved] = await Promise.all([getAdminProduct(id), getAdminReserved(id)]);
  return { meta, entry, reserved, isNew: false as const };
}

// Contenido de la página de links para el panel.
export async function loadAdminContent(): Promise<SiteContent | null> {
  if (!(await allowed("links.contenido.editar"))) return null;
  return getContent();
}

// ---- Pedidos (SPEC 17): las tres pantallas exigen `pedidos.pedidos.gestionar` ----

export async function loadAdminOrders(query: Parameters<typeof readOrderList>[0]) {
  if (!(await allowed("pedidos.pedidos.gestionar"))) return null;
  return readOrderList(query);
}

export async function loadAdminRequests(query: Parameters<typeof readRequests>[0]) {
  if (!(await allowed("pedidos.pedidos.gestionar"))) return null;
  return readRequests(query);
}

// Lo que necesita el editor para el selector de líneas y los totales. Solo lectura del catálogo.
async function orderCatalog() {
  const list = await getAdminCatalogList();
  return {
    currency: list.currency,
    freeShippingFrom: list.freeShippingFrom,
    products: list.products.map(({ id, name, visible, cover }) => ({ id, name, visible, cover })),
  };
}

export async function loadAdminOrder(id: string) {
  if (!(await allowed("pedidos.pedidos.gestionar"))) return null;
  const [bundle, catalog, canVoid] = await Promise.all([
    readOrder(id),
    orderCatalog(),
    allowed("pedidos.ventas.anular"),
  ]);
  return { bundle, catalog, canVoid };
}

// Pedido nuevo, vacío o precargado desde una solicitud. No escribe nada.
export async function loadNewOrder(requestCode: string | null) {
  if (!(await allowed("pedidos.pedidos.gestionar"))) return null;
  const catalog = await orderCatalog();
  if (requestCode === null) return { catalog, request: null, draft: null };
  const request = await readRequest(requestCode);
  if (!request || request.status !== "pendiente") return { catalog, request, draft: null };
  return { catalog, request, draft: await draftFromRequest(request) };
}
