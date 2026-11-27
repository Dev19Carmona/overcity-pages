import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  can,
  firstAllowedPath,
  hasAnyAdminPermission,
  knownPermissions,
  type Session,
} from "@/lib/permissions";

const session = (permissions: Session["permissions"]): Session => ({
  sub: "u",
  email: "u@x.co",
  name: "U",
  permissions,
  modules: [],
});

describe("can()", () => {
  it("es false sin sesión", () => {
    for (const permission of PERMISSIONS) expect(can(null, permission)).toBe(false);
  });

  it("solo concede los permisos que la sesión tiene", () => {
    const s = session(["catalogo.categorias.editar"]);
    expect(can(s, "catalogo.categorias.editar")).toBe(true);
    expect(can(s, "links.contenido.editar")).toBe(false);
    expect(can(s, "catalogo.productos.editar")).toBe(false);
  });
});

describe("permisos de pedidos (SPEC 17)", () => {
  it("van al final del catálogo y abren /admin/pedidos", () => {
    expect(PERMISSIONS.slice(-2)).toEqual(["pedidos.pedidos.gestionar", "pedidos.ventas.anular"]);
    expect(firstAllowedPath(session(["pedidos.pedidos.gestionar"]))).toBe("/admin/pedidos");
    expect(firstAllowedPath(session(["pedidos.ventas.anular", "catalogo.colores.editar"]))).toBe(
      "/admin/catalogo/colores",
    );
    expect(knownPermissions(["pedidos.ventas.anular", "pedidos.otro.x"])).toEqual([
      "pedidos.ventas.anular",
    ]);
  });
});

describe("knownPermissions()", () => {
  it("ignora permisos desconocidos y core.*", () => {
    expect(knownPermissions(["core.users.read", "x.y.z", "links.contenido.editar"])).toEqual([
      "links.contenido.editar",
    ]);
  });
});

describe("hasAnyAdminPermission() y firstAllowedPath()", () => {
  it("sin sesión o sin permisos no hay ruta", () => {
    expect(hasAnyAdminPermission(null)).toBe(false);
    expect(hasAnyAdminPermission(session([]))).toBe(false);
    expect(firstAllowedPath(null)).toBeNull();
    expect(firstAllowedPath(session([]))).toBeNull();
  });

  it("devuelve la primera pantalla permitida en el orden del panel", () => {
    expect(firstAllowedPath(session(["links.contenido.editar", "catalogo.productos.editar"]))).toBe("/admin");
    expect(firstAllowedPath(session(["catalogo.ajustes.editar", "catalogo.colores.editar"]))).toBe(
      "/admin/catalogo/colores",
    );
    expect(firstAllowedPath(session(["catalogo.categorias.editar"]))).toBe("/admin/catalogo/categorias");
    expect(hasAnyAdminPermission(session(["catalogo.ajustes.editar"]))).toBe(true);
  });
});
