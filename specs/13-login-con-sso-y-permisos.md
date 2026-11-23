# SPEC 13 — Login con SSO (base-template) y permisos por módulo

> **Estado:** Aprobado
> **Depende de:** SPEC 02, SPEC 05, SPEC 06, SPEC 07, SPEC 12 de este repo; **SPEC 16 y SPEC 17 de `base-template`** (implementadas y desplegadas)
> **Contrato SSO:** `sso-v1` (ver `base-template/specs/16-sso-y-aplicaciones-cliente.md`)
> **Fecha:** 2026-11-20
> **Objetivo:** Reemplazar la clave única `ADMIN_PASSWORD` y la cookie firmada por inicio de sesión delegado en base-template (OIDC, Authorization Code + PKCE), y autorizar cada pantalla, Server Action y ruta de API del panel con los permisos que llegan en el token.

## Por qué existe este spec

Hoy `/admin` se protege con una sola clave compartida (`lib/auth.ts`): no hay personas, ni roles, ni forma de dar acceso solo al catálogo. Overcity es el primer proyecto cliente de base-template; allí viven los usuarios, las empresas, los módulos asignados y los roles. Overcity conserva su sitio, su panel y sus datos (Redis, Blob, Supabase) y delega **solo quién eres y qué puedes hacer**.

Decisiones que lo condicionan (ver `base-template/CLAUDE.md`):

- Modelo 1: el admin sigue dentro de este proyecto. Base-template no lo absorbe.
- Los roles y permisos se crean en base-template; aquí solo se comprueban.
- Nadie edita código de un módulo ajeno: este spec no modifica la lógica de catálogo ni de contenido, solo **quién puede invocarla**.
- Los secretos del IdP no se comparten: Overcity verifica los tokens con la clave pública (JWKS) y tiene su propio `client_secret`.

Antes de escribir código de Next.js lee `AGENTS.md` y la guía correspondiente en `node_modules/next/dist/docs/` (esta versión tiene cambios incompatibles). No leas ni edites `.env.local`; trabaja con `.env.example`.

## Alcance

**Dentro:**

- `lib/sso/`: cliente OIDC sin dependencias de Overcity (PKCE, URLs, intercambio de código, verificación de tokens con `jose`, refresh y revocación), escrito para poder extraerlo después a un paquete compartido.
- Rutas `app/auth/login` y `app/auth/callback` (Route Handlers) y la Server Action de cierre de sesión.
- **Sesión en el servidor (Redis)** con cookie opaca, refresh del token con bloqueo para evitar la carrera de rotación, y revocación al cerrar sesión.
- `lib/auth.ts` reescrito: `getSession()`, `can(session, permiso)` y `requirePermission()` reemplazan a `isAdmin()` en **todos** sus puntos de uso.
- Catálogo de permisos de Overcity (módulos `links` y `catalogo`) y su registro en base-template.
- Pantalla de entrada (botón "Entrar con tu cuenta"), pantalla "Sin permiso" y navegación del panel filtrada por permisos.
- Variables de entorno nuevas, retiro de `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET`, y guía de corte con rollback.
- Vitest como primer test runner del repo y pruebas de la verificación de tokens, la sesión y los permisos.
- Actualizar `CLAUDE.md`, `.env.example` y `base-template/clients/overcity.md`.

**Fuera de alcance (specs futuros):**

- Crear usuarios, roles o asignar permisos desde Overcity: se hace en base-template.
- Permisos de solo lectura (`ver`) separados de los de edición: hoy un permiso `editar` da acceso a la pantalla y a su edición.
- Auditoría propia de Overcity (solo se registran en logs el login, el logout y las denegaciones con el `sub`).
- Publicar el cliente OIDC como paquete npm (se extrae cuando entre el segundo proyecto Next).
- Acceso de emergencia sin SSO si base-template no responde (ver Riesgos).
- Login de los visitantes de la tienda, clientes con cuenta o pedidos.
- Aislar entornos de *preview* de Vercel con login (solo se registran producción y local).
- MFA (se añade en base-template sin tocar este proyecto).
- Mover `SiteContent` o el catálogo a base-template.

## Permisos de Overcity

Módulos y permisos que Overcity declara a base-template (claves `modulo.recurso.accion`, el primer segmento es la clave del módulo):

| Módulo (`moduleKey`) | Permiso | Da acceso a |
|---|---|---|
| `links` | `links.contenido.editar` | `/admin` (página de links: textos, links, redes, fondo, música, efectos, logo) y las rutas `/api/logo` y `/api/media` |
| `catalogo` | `catalogo.productos.editar` | Lista y ficha de productos (crear, editar, borrar, visibilidad, orden, fotos) y `/api/catalog-media` |
| `catalogo` | `catalogo.categorias.editar` | `/admin/catalogo/categorias` |
| `catalogo` | `catalogo.colores.editar` | `/admin/catalogo/colores` |
| `catalogo` | `catalogo.ajustes.editar` | `/admin/catalogo/ajustes` (título, moneda, WhatsApp, envío gratis) |

`client_apps.moduleKeys` de Overcity = `['links', 'catalogo']`. Los permisos `core.*` nunca llegan en el token.

Reglas:

- **Entrar al panel** exige tener al menos uno de los cinco permisos. Sin ninguno, se muestra "Sin permiso".
- La ficha de producto necesita categorías y colores como metadatos de lectura: se cargan con `catalogo.productos.editar` (no requiere los permisos de editar categorías o colores).
- Un permiso desconocido en el token se ignora.
- **El servidor es la única autoridad.** Ocultar un enlace no protege nada: cada Server Action, loader y Route Handler comprueba su permiso.

## Flujo de inicio de sesión

1. `/admin` sin sesión muestra el botón **Entrar con tu cuenta**, un enlace normal (sin *prefetch*) a `/auth/login`.
2. `GET /auth/login`:
   - Genera `state`, `nonce` y `code_verifier` (PKCE `S256`) con `crypto`.
   - Guarda `{ state, nonce, verifier, returnTo }` en la cookie `overcity_oidc` **cifrada** (AES-256-GCM con una clave derivada de `AUTH_SESSION_SECRET`), `HttpOnly`, `Secure` en producción, `SameSite=Lax`, `Path=/auth`, 10 minutos.
   - `returnTo` solo se acepta si empieza por `/admin` y no contiene `//`, `\` ni esquema; en otro caso es `/admin`.
   - Redirige a `${AUTH_ISSUER}/oidc/authorize` con `response_type=code`, `client_id`, `redirect_uri = ${APP_URL}/auth/callback`, `scope=openid profile email`, `state`, `nonce`, `code_challenge` y `code_challenge_method=S256`.
3. `GET /auth/callback`:
   - Borra la cookie `overcity_oidc` en cualquier caso.
   - Si llega `error`, redirige a `/admin?error=<código conocido>` (nunca refleja texto del query).
   - Comprueba que existe la cookie, que `state` coincide (comparación en tiempo constante) y que hay `code`.
   - Intercambia el código en `POST ${AUTH_ISSUER}/oidc/token` con `client_secret_basic` y `code_verifier`.
   - Verifica el **ID token** y el **access token** (reglas de abajo), y el `nonce` del ID token.
   - Crea la sesión (ver más abajo) y redirige a `returnTo`.
4. Ante cualquier fallo responde con `/admin?error=<código>` y registra el motivo real en logs, sin tokens ni secretos.

### Verificación de tokens

Con `jose`: `createRemoteJWKSet(${AUTH_ISSUER}/.well-known/jwks.json)` (con caché y recarga ante `kid` desconocido) y `jwtVerify` con:

- `algorithms: ['ES256']` (se rechaza cualquier otro, incluido `none`).
- `issuer: AUTH_ISSUER` y `audience: AUTH_CLIENT_ID`.
- `typ: at+jwt` para el access token.
- ID token: `nonce` igual al guardado.
- Access token: `tenant_id === AUTH_TENANT_ID` (la empresa dueña de Overcity), `role === 'user'`, y `permissions` y `modules` como listas de textos.

Un `admin` de plataforma, un usuario de otra empresa o un token de otra aplicación **no inician sesión**.

## Sesión

Cookie `overcity_session` (reemplaza a `overcity_admin`): un identificador **opaco** de 32 bytes aleatorios (base64url), `HttpOnly`, `Secure` en producción, `SameSite=Lax`, `Path=/`. No lleva datos.

Registro en Redis `overcity:session:<sid>` (TTL = duración máxima de la sesión):

```ts
interface SessionRecord {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  permissions: string[];            // solo las claves conocidas de Overcity
  modules: string[];
  accessExpiresAt: number;          // ms, del exp del access token
  refreshToken: string;             // cifrado con AES-256-GCM (AUTH_SESSION_SECRET); nunca en claro
  createdAt: number;
  sessionExpiresAt: number;         // máximo absoluto: 7 días desde createdAt
}
```

Por qué Redis y no una cookie con los datos: el refresh token debe quedarse **solo en el servidor** (contrato `sso-v1`), cambia en cada rotación, y renovar los permisos no debe escribir cookies (los Server Components no pueden escribirlas mientras renderizan).

### Renovación (refresh)

- `getSession()` lee la cookie y el registro. Si `accessExpiresAt` está a menos de 30 segundos, renueva con `grant_type=refresh_token`.
- **Una sola renovación a la vez por sesión:** se toma un bloqueo en Redis (`SET overcity:session-lock:<sid> NX EX 15`). Quien no lo obtiene espera brevemente y relee el registro. Esto evita que dos peticiones simultáneas usen el mismo refresh token, lo que el IdP interpretaría como reutilización y revocaría toda la familia.
- Tras renovar se verifican los tokens nuevos con las mismas reglas, se actualizan permisos, módulos, `accessExpiresAt` y el refresh token rotado.
- Si el IdP responde `invalid_grant` (revocado, suspendido, usuario desactivado) o los tokens nuevos no pasan la verificación, la sesión se borra y el usuario vuelve al login.
- Si el IdP no responde (error de red o 5xx), `getSession()` **deniega** (cierra en falla) sin borrar la sesión, para que se recupere cuando vuelva.
- Los permisos pueden tardar como máximo el TTL del access token (10 min) en reflejar un cambio de rol.
- `getSession()` usa `await connection()` antes de `Date.now()`, como hace hoy `isAdmin()`.

### Cierre de sesión

Server Action `logoutAction` (existente): llama a `POST ${AUTH_ISSUER}/oidc/revoke` con el refresh token (si falla, sigue), borra el registro de Redis y la cookie, y registra el evento. Cierra **solo la sesión de Overcity**; la sesión de base-template sigue abierta, así que volver a entrar es inmediato. Es el comportamiento esperado de un SSO. **Reemplazado por el SPEC 15** (cierre de sesión único): ahora el navegador también pasa por `{AUTH_ISSUER}/oidc/logout` y se cierra la sesión de base-template.

## Autorización por punto de entrada

`lib/auth.ts` expone:

```ts
getSession(): Promise<Session | null>                    // null sin sesión válida
can(session: Session | null, permission: Permission): boolean   // false si no hay sesión
hasAnyAdminPermission(session): boolean
firstAllowedPath(session): string | null                 // para redirigir /admin
```

Estados que debe distinguir cada pantalla:

- **Sin sesión:** pantalla de entrada. No se entrega ningún dato.
- **Con sesión, sin el permiso de esa pantalla:** pantalla "Sin permiso" con HTTP 200 y contenido de 403; no se entrega ningún dato.
- **Con permiso:** la pantalla.

Los **Route Handlers** responden 401 sin sesión y 403 sin permiso. Las **Server Actions** responden `{ ok: false, error }` con mensaje legible.

Todo `isAdmin()` actual se sustituye así (búsqueda obligatoria: `grep -rn isAdmin app lib` no debe devolver nada al final):

| Punto de uso | Permiso exigido |
|---|---|
| `app/admin/layout.tsx` (compuerta general) | cualquier permiso admin; la pantalla de cada ruta exige el suyo |
| `app/admin/actions.ts` → `saveContent` | `links.contenido.editar` |
| `app/admin/_lib.ts` → `loadAdminContent` | `links.contenido.editar` |
| `app/admin/_lib.ts` → `loadAdminList`, `loadAdminEditor` | `catalogo.productos.editar` |
| `app/admin/_lib.ts` → `loadAdminColors` | `catalogo.colores.editar` |
| `app/admin/_lib.ts` → `loadAdminSettings` | `catalogo.ajustes.editar` |
| `app/admin/catalogo/actions.ts` → `saveProduct`, `deleteProduct`, `setProductVisible`, `moveProduct` | `catalogo.productos.editar` |
| `app/admin/catalogo/actions.ts` → `saveCategories` | `catalogo.categorias.editar` |
| `app/admin/catalogo/actions.ts` → `saveColors` | `catalogo.colores.editar` |
| `app/admin/catalogo/actions.ts` → `saveCatalogSettings` | `catalogo.ajustes.editar` |
| `app/api/logo/route.ts` (POST y DELETE) | `links.contenido.editar` |
| `app/api/media/route.ts` | `links.contenido.editar` |
| `app/api/catalog-media/route.ts` | `catalogo.productos.editar` |

Si al implementar una pantalla usa un loader distinto del indicado, **gana el permiso de la pantalla** y se corrige esta tabla en el mismo cambio. La página de categorías obtiene sus datos con el permiso de categorías (no con el de productos).

## Interfaz

Se sigue el estilo oficial de Overcity (`CLAUDE.md`, skill `estilo-overcity`, `references/estilo/`): sin colores ni tipografías nuevas, `<dialog>` solo si hace falta, foco visible, contraste 4.5:1, revisar a 360 px.

- **Entrada:** reemplaza `LoginForm` por un texto breve y el botón **Entrar con tu cuenta** (píldora roja del estilo). Mensajes de error desde un mapa fijo de códigos (`access_denied`, `invalid_state`, `session_expired`, `not_configured`, `generic`); un código desconocido muestra el genérico. `role="alert"`.
- **Sin permiso:** título, una frase ("Tu cuenta no tiene permisos para esta sección"), enlace a una sección permitida si existe y botón **Cerrar sesión**.
- **Navegación (`AdminNav`):** solo muestra las secciones permitidas. `/admin` redirige a `firstAllowedPath()` si el usuario no puede editar los links.
- El nombre del usuario aparece en la barra lateral junto a **Cerrar sesión**, sin mostrar el correo completo en móvil.

## Variables de entorno

Nuevas (se documentan en `.env.example`, sin valores):

| Variable | Notas |
|---|---|
| `APP_URL` | URL pública canónica de Overcity (`https://…`); se usa para `redirect_uri`. **Nunca se deriva de la cabecera `Host`.** |
| `AUTH_ISSUER` | URL pública de base-template (`SSO_ISSUER` de allá) |
| `AUTH_CLIENT_ID` | del registro en `/platform/client-apps` |
| `AUTH_CLIENT_SECRET` | mostrado una sola vez al registrar o rotar; solo servidor |
| `AUTH_TENANT_ID` | UUID de la empresa Overcity en base-template |
| `AUTH_SESSION_SECRET` | mínimo 32 caracteres; cifra la cookie `overcity_oidc` y el refresh token en Redis |

Se retiran `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET` (al final del corte). Si falta cualquiera de las nuevas, el login responde `not_configured` y no abre sesión (cierra en falla).

## Plan de implementación

- [ ] 1. Lee `AGENTS.md` y la guía de Next 16 sobre Route Handlers, `cookies()` y `connection()` con `cacheComponents`. Instalar `jose` y `vitest`; scripts `test` en `package.json`; actualizar `CLAUDE.md` ("No test runner is configured").
- [ ] 2. `lib/sso/`: `pkce.ts`, `flow-cookie.ts` (cifrado AES-GCM de la cookie de flujo), `tokens.ts` (verificación con `jose`), `client.ts` (authorize URL, intercambio, refresh, revoke). Sin importar nada de `app/` ni de `lib/` de Overcity salvo la configuración leída de `process.env`.
- [ ] 3. `lib/session.ts`: registro en Redis, cifrado del refresh token, bloqueo de renovación y expiración absoluta.
- [ ] 4. Reescribir `lib/auth.ts` con `getSession`, `can`, `hasAnyAdminPermission`, `firstAllowedPath`, `logout` y la lista de permisos conocidos.
- [ ] 5. Rutas `app/auth/login/route.ts` y `app/auth/callback/route.ts`.
- [ ] 6. Sustituir `isAdmin()` en todos los puntos de la tabla; actualizar `logoutAction`; eliminar `loginAction` y `LoginForm`.
- [ ] 7. Pantallas de entrada, "Sin permiso" y `AdminNav` filtrado.
- [ ] 8. `.env.example`, `CLAUDE.md` (sección de arquitectura y variables) y `base-template/clients/overcity.md`.
- [ ] 9. Pruebas unitarias (ver Verificación).
- [ ] 10. Corte en producción (ver abajo) y verificación manual con el IdP real.
- [ ] 11. Marcar este spec como Implementado y retirar `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET`.

## Corte en producción (con rollback)

El orden evita quedarse sin acceso:

1. Base-template (SPEC 16 y 17) desplegado y funcionando.
2. En base-template: registrar los módulos `links` y `catalogo` con sus permisos (`PUT /platform/modules/:key`), dar de alta la empresa Overcity con esos módulos activos, crear los roles y los usuarios, y registrar la aplicación cliente con `redirectUris` exactas (`${APP_URL}/auth/callback` en producción y `http://localhost:3000/auth/callback` para desarrollo), `postLogoutRedirectUris` y `moduleKeys = ['links','catalogo']`. Guardar el `client_secret` en el gestor de secretos.
3. En Vercel: añadir las variables nuevas **sin quitar** `ADMIN_PASSWORD` ni `ADMIN_SESSION_SECRET`.
4. Desplegar. Verificar con una cuenta real: entrar, ver solo lo permitido, ser rechazado en lo no permitido, cerrar sesión.
5. Solo entonces retirar `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET` de Vercel y limpiar las claves viejas `overcity:ratelimit:login:*` en Redis.

**Rollback antes del paso 5:** volver a desplegar el commit anterior; las variables viejas siguen ahí y el login por clave funciona como antes. Después del paso 5 el rollback exige restaurar esas variables.

Los despliegues de *preview* de Vercel no pueden iniciar sesión (su URL cambia y la `redirect_uri` es exacta). Es intencional: se prueba en local o en producción.

## Criterios de aceptación

- [ ] `grep -rn "isAdmin\|ADMIN_PASSWORD\|ADMIN_SESSION_SECRET" app lib scripts` no devuelve resultados.
- [ ] Sin sesión, `/admin` y todas sus subrutas muestran la pantalla de entrada y no entregan datos; las Server Actions y los Route Handlers responden 401 o `ok: false`.
- [ ] El flujo completo funciona contra base-template: `/auth/login` → login → `/auth/callback` → panel.
- [ ] Un `state` o un `nonce` distinto, una cookie `overcity_oidc` ausente o un código reutilizado impiden entrar.
- [ ] Un token con `aud` distinto, `iss` distinto, `alg` distinto de ES256, expirado, con firma inválida o con `tenant_id` distinto de `AUTH_TENANT_ID` no inicia sesión.
- [ ] Un `admin` de plataforma y un usuario de otra empresa no entran.
- [ ] `returnTo` con `//evil.com`, `https://…`, `\` o fuera de `/admin` termina en `/admin`.
- [ ] La cookie `overcity_session` no contiene datos del usuario ni tokens; el refresh token en Redis está cifrado.
- [ ] Un usuario solo con `catalogo.categorias.editar` ve y edita solo categorías: en las demás pantallas ve "Sin permiso", sus Server Actions responden denegado y `/api/logo`, `/api/media` y `/api/catalog-media` responden 403.
- [ ] Un usuario solo con `links.contenido.editar` edita los links y no puede tocar el catálogo.
- [ ] Peticiones simultáneas con el access token por vencer producen **una** sola renovación y no revocan la familia.
- [ ] Revocar al usuario o suspender la aplicación en base-template cierra la sesión de Overcity como máximo a los 10 minutos.
- [ ] Si base-template no responde durante una renovación, el panel deniega sin romperse y se recupera después.
- [ ] Cerrar sesión borra el registro de Redis y la cookie, y revoca el refresh token en el IdP.
- [ ] Ningún secreto, token ni `code` aparece en logs ni en el HTML entregado.
- [ ] La entrada, "Sin permiso" y la navegación cumplen el estilo oficial, funcionan a 360 px y son accesibles por teclado.
- [ ] `npm run lint`, `npm run build` y `npm test` pasan.

## Verificación

- **Pruebas unitarias (Vitest):** PKCE (`S256` del verifier), cifrado y manipulación de la cookie de flujo, sanitización de `returnTo`, verificación de tokens con un JWKS local de pruebas (ES256 generado con `jose`: válido, `aud` o `iss` erróneos, `alg` distinto, expirado, firma ajena, `typ` erróneo, `tenant_id` distinto, `nonce` distinto, `role: admin`), `can()` y `firstAllowedPath()`, y la renovación con bloqueo usando un Redis falso (dos llamadas concurrentes, una sola renovación).
- **Pruebas por punto de entrada:** una prueba por fila de la tabla de autorización que confirme sin sesión → denegado, con sesión sin permiso → denegado, con permiso → permitido.
- **Verificación manual contra el IdP real** (local y producción): entrar, cambiar un rol en base-template y comprobar que el cambio llega en ≤10 min, suspender la aplicación, cerrar sesión y volver a entrar.
- Revisar a 360 px y con teclado la entrada y "Sin permiso".

## Riesgos

- **Base-template caído:** nadie nuevo puede entrar (las sesiones abiertas siguen mientras el refresh funcione). Se acepta por diseño: no hay clave de emergencia, porque reintroduciría el secreto compartido. Mitigación: uptime y backups de base-template; si el negocio exige un acceso de emergencia, se define en un spec propio.
- **Carrera de refresh:** el bloqueo es crítico; sin él una familia de tokens se revoca sola. Cubierto por prueba.
- **Configuración incorrecta de `redirect_uri` o `APP_URL`:** el login falla cerrado. Se prueba en el corte antes de retirar las claves viejas.
- **Permisos desactualizados hasta 10 minutos** por diseño del contrato.
- **Olvidar un `isAdmin()`** al migrar: el criterio de `grep` y las pruebas por punto de entrada lo detectan.
- **Cambios incompatibles de Next 16** en `cookies()` y Route Handlers con `cacheComponents`: leer la guía antes de escribir.
- **Registro desincronizado con base-template:** si se añade un permiso aquí y no se registra allá, nadie podrá recibirlo. Cualquier permiso nuevo exige actualizar `PUT /platform/modules/:key` en el mismo cambio.

## Decisiones

- **Sí:** sesión en Redis con cookie opaca, no un JWT en cookie. Permite revocar, guardar el refresh token solo en el servidor y renovar sin escribir cookies.
- **Sí:** el código OIDC queda en `lib/sso/` dentro de este repo y **no** en un paquete npm todavía. Con un solo proyecto Next no hay segundo consumidor que muestre qué debe ser genérico; mantenerlo sin dependencias de Overcity hace que extraerlo después sea mecánico. (La SPEC 16 de base-template mencionaba un paquete `auth-client`; se pospone hasta que entre un segundo cliente Next.)
- **Sí:** `jose` para verificar los tokens. No se escribe criptografía a mano.
- **Sí:** un permiso `editar` por pantalla; los de solo lectura se añaden cuando alguien los pida.
- **No:** clave de emergencia ni login local paralelo.
- **No:** guardar el access token ni el refresh token en el navegador.
- **No:** derivar `redirect_uri` de las cabeceras de la petición.
