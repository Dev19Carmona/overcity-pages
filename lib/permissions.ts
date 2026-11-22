// Catálogo de permisos de Overcity (SPEC 13). Claves `modulo.recurso.accion`; el primer segmento es
// el módulo registrado en base-template. Sin `server-only`: lo usan también el panel y las pruebas.
// Un permiso nuevo exige registrarlo en base-template (`PUT /platform/modules/:key`) en el mismo cambio.
export const PERMISSIONS = [
  "links.contenido.editar",
  "catalogo.productos.editar",
  "catalogo.categorias.editar",
  "catalogo.colores.editar",
  "catalogo.ajustes.editar",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface Session {
  sub: string;
  email: string;
  name: string;
  permissions: Permission[];
  modules: string[];
}

// Pantalla (ruta) que abre cada permiso, en el orden en que `firstAllowedPath` los recorre.
export const PERMISSION_PATHS: Record<Permission, string> = {
  "links.contenido.editar": "/admin",
  "catalogo.productos.editar": "/admin/catalogo",
  "catalogo.categorias.editar": "/admin/catalogo/categorias",
  "catalogo.colores.editar": "/admin/catalogo/colores",
  "catalogo.ajustes.editar": "/admin/catalogo/ajustes",
};

// Se quedan solo las claves conocidas de Overcity; cualquier otra (p. ej. `core.*`) se ignora.
export function knownPermissions(granted: readonly string[]): Permission[] {
  return PERMISSIONS.filter((permission) => granted.includes(permission));
}

export function can(session: Session | null, permission: Permission): boolean {
  return session !== null && session.permissions.includes(permission);
}

export function hasAnyAdminPermission(session: Session | null): boolean {
  return session !== null && session.permissions.length > 0;
}

export function firstAllowedPath(session: Session | null): string | null {
  if (!session) return null;
  const first = PERMISSIONS.find((permission) => session.permissions.includes(permission));
  return first ? PERMISSION_PATHS[first] : null;
}
