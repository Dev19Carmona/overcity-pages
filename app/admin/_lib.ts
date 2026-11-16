import "server-only";
import { isAdmin } from "@/lib/auth";
import {
  getAdminCatalogList,
  getAdminColors,
  getAdminEditorMeta,
  getAdminProduct,
  getAdminSettings,
} from "@/lib/catalog";
import type { CatalogList } from "@/lib/catalog-shared";
import { getContent, type SiteContent } from "@/lib/content";

// Lista ligera del catálogo (todos los productos, sin stock ni descripciones) para el panel;
// null si no hay sesión (no se entrega nada).
export async function loadAdminList(): Promise<CatalogList | null> {
  if (!(await isAdmin())) return null;
  return getAdminCatalogList();
}

export async function loadAdminColors() {
  if (!(await isAdmin())) return null;
  return getAdminColors();
}

export async function loadAdminSettings() {
  if (!(await isAdmin())) return null;
  return getAdminSettings();
}

// Ficha del panel: categorías, colores y moneda, más el producto con su versión (null = no existe).
export async function loadAdminEditor(id: string) {
  if (!(await isAdmin())) return null;
  const meta = await getAdminEditorMeta();
  if (id === "nuevo") return { meta, entry: null, isNew: true as const };
  const entry = await getAdminProduct(id);
  return { meta, entry, isNew: false as const };
}

// Contenido de la página de links para el panel; null si no hay sesión.
export async function loadAdminContent(): Promise<SiteContent | null> {
  if (!(await isAdmin())) return null;
  return getContent();
}
