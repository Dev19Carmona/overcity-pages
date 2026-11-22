# SPEC 14 — Páginas públicas según los módulos activos de la empresa

> **Estado:** Aprobado
> **Depende de:** SPEC 07, SPEC 08, SPEC 12 y SPEC 13 de este repo; **SPEC 20 de `base-template`** (endpoint `GET /oidc/modules`, debe estar implementada y desplegada antes)
> **Contrato SSO:** `sso-v1` + extensión aditiva `GET /oidc/modules` (ver `base-template/specs/20-modulos-activos-para-clientes.md`)
> **Fecha:** 2026-11-22
> **Objetivo:** Que las páginas públicas de Overcity (`/` y `/catalogo*`) y la bolsa de compra dejen de estar disponibles cuando la empresa Over City no tiene activo el módulo correspondiente (`links` o `catalogo`) en base-template, mostrando "Esta sección no está disponible" con estado 404.

## Por qué existe este spec

Hoy el interruptor de módulos de base-template solo gobierna el **panel admin**, a través del claim `permissions` del token (SPEC 13). Las páginas públicas no tienen sesión y nunca preguntan a base-template si la empresa contrató el módulo. Caso observado: se quitó `links` a Over City desde el panel de superadmin y la página pública de links siguió funcionando.

La regla de negocio es: **una página pública se apaga solo si la empresa no tiene el módulo**, sin importar quién la visite. No depende de ningún usuario ni de sus permisos.

Decisiones del usuario que lo condicionan (2026-11-22):

- Si base-template no responde, la página pública **sigue con el último valor conocido**: una caída de la plataforma no debe tumbar la tienda.
- Con el módulo apagado, el visitante ve **"Esta sección no está disponible"** con estado HTTP 404, no un error técnico.
- Orden de trabajo (`base-template/CLAUDE.md`): contrato y base-template primero (SPEC 20), cliente después (este spec).

Superficies públicas y su módulo:

| Superficie | Módulo |
|---|---|
| `/` (página de links) | `links` |
| `/catalogo` y `/catalogo/[id]` (tienda y ficha) | `catalogo` |
| Server Action pública `getCartProducts` (bolsa de compra) | `catalogo` |

El panel `/admin` **no cambia**: sigue autorizando por permisos (SPEC 13).

## Alcance

**Incluye:**

- Un módulo de servidor `lib/modules.ts` (propuesto) que consulta `GET {AUTH_ISSUER}/oidc/modules` con `AUTH_CLIENT_ID` y `AUTH_CLIENT_SECRET` (`client_secret_basic`), con caché de ~60 s y persistencia del **último valor conocido** para cuando la consulta falla.
- Bloquear con 404 y la página "no disponible": `/` si `links` está apagado; `/catalogo` y `/catalogo/[id]` si `catalogo` está apagado.
- Que `getCartProducts` devuelva lista vacía si `catalogo` está apagado.
- Que la home no muestre el botón del catálogo ni los botones de categoría cuando `catalogo` está apagado, para no dejar enlaces muertos.
- Página "Esta sección no está disponible" con el estilo oficial de Overcity (CLAUDE.md, sección *Estilo*) y estado 404.
- Pruebas Vitest en `tests/` y actualización de `CLAUDE.md` de este repo.

**Fuera de alcance (para futuros specs):**

- Cambios en `/admin` o en sus permisos (SPEC 13 los cubre).
- Avisos activos de base-template al cambiar los módulos (webhooks o invalidación inmediata): el cliente consulta con caché corta.
- Cambiar `SSO_ACCESS_TTL` o hacer que los permisos del panel se revoquen al instante.
- Apagar las rutas de API (`/api/logo`, `/api/media`, `/api/catalog-media`): ya exigen sesión y permiso.
- Una página "no disponible" configurable desde el panel.

## Modelo de datos

No introduce tablas. Añade una clave de Redis y un contrato de lectura:

```ts
// Respuesta de GET {AUTH_ISSUER}/oidc/modules (SPEC 20 de base-template)
interface ClientModulesResponse {
  tenantId: string;
  modules: string[]; // p. ej. ["catalogo", "links"]
}
```

```text
overcity:modules:v1  →  { modules: string[], fetchedAt: number }   // último valor conocido
```

Convenciones:

- La caché de ~60 s evita consultar en cada visita; el valor persistido en Redis solo se usa cuando la consulta falla.
- Si **nunca** se conoció un valor (arranque en frío con base-template caído) o el SSO no está configurado (`readSsoConfig()` devuelve `null`), el módulo se trata como **activo**. Es la regla de la guía del contrato (SPEC 20): no apagar una tienda por no saber.
- Una respuesta correcta con `modules: []` sí apaga ambos módulos; no es un fallo.
- El secreto del cliente solo se usa en el servidor y nunca se registra en logs.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` lo relevante a caché con `cacheComponents` (`"use cache"`, `cacheLife`), `notFound()` y el 404 personalizado, según `AGENTS.md`, antes de escribir código.
2. Crear `lib/modules.ts` (`server-only`): función pura `fetchActiveModules(config, fetchImpl)` (inyectable para las pruebas), `getActiveModules()` con caché de ~60 s y último valor conocido en Redis, y `isModuleActive(key)`.
3. Crear la página "Esta sección no está disponible" (404) con el estilo oficial y usarla desde un helper que llame a `notFound()` cuando el módulo esté apagado; el mecanismo exacto se confirma en el paso 1.
4. Aplicar el bloqueo en `app/page.tsx` (`links`), `app/catalogo/page.tsx` y `app/catalogo/[id]/page.tsx` (`catalogo`), y en `getCartProducts` (`catalogo`).
5. En la home, ocultar el botón del catálogo y los de categoría cuando `catalogo` esté apagado.
6. Pruebas en `tests/modules.test.ts`: respuesta válida, módulo ausente, `modules: []`, fallo con valor conocido, fallo sin valor conocido, SSO sin configurar y que el secreto no aparece en logs.
7. Actualizar `CLAUDE.md` de este repo (nueva sección sobre módulos activos y la clave `overcity:modules:v1`) y la entrada de Overcity en `base-template/clients/overcity.md` **en un commit aparte en el repo de base-template**.
8. Verificación manual con SPEC 20 desplegada: quitar `links` a Over City en base-template y comprobar que `/` responde 404 "no disponible" en ~60 s; reactivarlo y comprobar que vuelve; repetir con `catalogo`.

## Criterios de aceptación

- [ ] Con `links` apagado para la empresa, `/` responde 404 con "Esta sección no está disponible" en ≤ ~60 s; al reactivarlo vuelve a servirse.
- [ ] Con `catalogo` apagado, `/catalogo` y `/catalogo/[id]` responden 404 con el mismo mensaje, y `getCartProducts` devuelve `[]`.
- [ ] Con `catalogo` apagado, la home no muestra el botón del catálogo ni los de categoría.
- [ ] Con `links` activo y `catalogo` apagado (y al revés) cada superficie se comporta según su propio módulo.
- [ ] Si base-template no responde y hay un valor conocido, las páginas siguen con ese valor; si no hay ninguno, se tratan como activas.
- [ ] Con el SSO sin configurar, las páginas públicas siguen funcionando.
- [ ] `/admin` y sus permisos no cambian (las pruebas de la SPEC 13 siguen pasando).
- [ ] La página "no disponible" cumple el estilo oficial, funciona a 360 px sin scroll horizontal y es accesible (contraste, foco).
- [ ] El `client_secret` no aparece en logs, respuestas ni en el cliente.
- [ ] `npm run lint`, `npm test` y `npm run build` terminan sin errores.
- [ ] Verificación manual documentada con `links` y con `catalogo`.

## Decisiones

- **Sí:** consultar a base-template por contrato (`GET /oidc/modules`) en vez de derivarlo de permisos del token: las páginas públicas no tienen usuario.
- **Sí:** caché de ~60 s y **último valor conocido** si la consulta falla. Decisión del usuario: una caída de la plataforma no tumba el sitio.
- **Sí:** 404 con mensaje "Esta sección no está disponible". Decisión del usuario.
- **Sí:** sin valor conocido o con el SSO sin configurar se trata el módulo como activo; apagar solo con una respuesta explícita.
- **Sí:** ocultar en la home los botones que llevan a una sección apagada, para no dejar enlaces rotos.
- **No:** tocar `/admin`; ya está protegido por permisos y no por módulos de la empresa.
- **No:** webhooks ni invalidación activa: no se justifica la infraestructura con un solo cliente.
- **No:** guardar el estado de módulos en la base de datos de Overcity (Supabase); es información de base-template y se lee por contrato.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un módulo apagado por error tumba la página pública | La acción es deliberada (panel de superadmin) y se revierte en ~60 s al reactivarlo. |
| base-template cae y el sitio no sabe el estado | Se sigue con el último valor conocido; sin valor se trata como activo. |
| Que el chequeo vuelva dinámicas las páginas hoy cacheadas y las vuelva lentas | La consulta va cacheada ~60 s; el contenido sigue en `"use cache"` con sus etiquetas. Se verifica en el paso 1 y en `npm run build`. |
| Fuga del `client_secret` | Solo servidor, `server-only`, nunca en logs ni en props de componentes de cliente. |
| Un visitante ve un enlace roto a una sección apagada | La home oculta los botones del catálogo y de categorías; el 404 cubre accesos directos. |
| Desfase entre SPEC 20 y este spec | Este spec depende de SPEC 20 ya implementada y desplegada; no se implementa antes. |

## Qué **no** está en este spec

- Cambios en `/admin` o en los permisos.
- Webhooks o invalidación inmediata.
- Cambios de `SSO_ACCESS_TTL` o revocación inmediata de permisos.
- Apagar rutas de API del panel.
- Mensaje "no disponible" editable desde el panel.

Cada uno, si llega, va en su propio spec.
