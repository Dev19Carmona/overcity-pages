import "server-only";
import { isAdmin } from "@/lib/auth";
import { getCatalog, type Catalog } from "@/lib/catalog";
import { getContent, type SiteContent } from "@/lib/content";

// Catálogo completo para las pantallas del panel; null si no hay sesión (no se entrega nada).
export async function loadAdminCatalog(): Promise<Catalog | null> {
  if (!(await isAdmin())) return null;
  return getCatalog();
}

// Contenido de la página de links para el panel; null si no hay sesión.
export async function loadAdminContent(): Promise<SiteContent | null> {
  if (!(await isAdmin())) return null;
  return getContent();
}
