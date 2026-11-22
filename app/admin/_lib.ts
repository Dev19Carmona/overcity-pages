import "server-only";
import { can, getSession } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import {
  getAdminCatalogList,
  getAdminColors,
  getAdminEditorMeta,
  getAdminProduct,
  getAdminSettings,
} from "@/lib/catalog";
import type { CatalogList } from "@/lib/catalog-shared";
import { getContent, type SiteContent } from "@/lib/content";

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
  if (id === "nuevo") return { meta, entry: null, isNew: true as const };
  const entry = await getAdminProduct(id);
  return { meta, entry, isNew: false as const };
}

// Contenido de la página de links para el panel.
export async function loadAdminContent(): Promise<SiteContent | null> {
  if (!(await allowed("links.contenido.editar"))) return null;
  return getContent();
}
