# SPEC 15 — Cierre de sesión único

> **Status:** Implementado en código; falta la verificación en producción (requiere base-template con su SPEC 22 desplegado).
> **Depends on:** SPEC 13; SPEC 22 de base-template
> **Date:** 2026-11-23
> **Objective:** Que "Cerrar sesión" en el panel de Overcity también cierre la sesión en base-template, para que "Entrar con tu cuenta" vuelva a pedir credenciales en lugar de entrar de inmediato.

---

## Por qué existe este spec

Hasta ahora `logoutAction` borraba la cookie `overcity_session` y revocaba el refresh token SSO, pero la sesión de base-template seguía abierta. Al pulsar "Entrar con tu cuenta", base-template aprobaba el acceso sin pedir clave y el usuario volvía a entrar sin querer. El SPEC 13 lo describía como comportamiento esperado de un SSO; para un panel de administración resulta confuso.

---

## Scope

**In:**

- Guardar el `id_token` del login en el registro de sesión, **cifrado** con AES-256-GCM y la misma clave que el refresh token (contexto propio).
- `logout()` devuelve la URL de cierre del IdP y `logoutAction` redirige el navegador a ella:
  `{AUTH_ISSUER}/oidc/logout?id_token_hint=<id_token>&post_logout_redirect_uri={APP_URL}/`.
- Pruebas de sesión y de la URL de cierre.

**Out of scope (para futuros specs):**

- Cerrar sesión en otras aplicaciones del mismo usuario.
- Cambiar a dónde vuelve el usuario tras cerrar sesión (hoy a la portada `/`).
- Un aviso en pantalla cuando el cierre en el IdP falla.

---

## Behavior

1. `logoutAction` llama a `logout()`: borra la cookie `overcity_session`, borra el registro de Redis, revoca el refresh token en el IdP (si falla, sigue) y, si el registro tenía `id_token`, arma la URL de cierre.
2. `redirect(url)` lleva al navegador a `{AUTH_ISSUER}/oidc/logout…`. Base-template valida el hint, cierra su sesión y vuelve a `post_logout_redirect_uri`.
3. Sin `id_token` (sesión abierta antes de esta spec, sin registro o error) se cierra solo la sesión de Overcity y se vuelve a `/admin`, como antes. Tras el siguiente login ya habrá `id_token` guardado.

`post_logout_redirect_uri` es `{APP_URL}/` y debe estar registrada **exacta** en la aplicación de base-template (`postLogoutRedirectUris`, con la barra final).

---

## Implementation plan

1. `buildEndSessionUrl(config, idToken)` en `lib/sso/client.ts`.
2. `idToken` opcional y cifrado en `SessionRecord`, `createSessionRecord` y `destroySessionRecord` (`lib/session.ts`).
3. `startSession` recibe el `id_token`; `app/auth/callback/route.ts` se lo pasa.
4. `logout()` devuelve la URL de cierre (o `null`) y `logoutAction` redirige.
5. Pruebas en `tests/session.test.ts` y `tests/sso-basics.test.ts`; actualizar `CLAUDE.md`.

---

## Acceptance criteria

- [x] El `id_token` se guarda cifrado y nunca en claro en Redis.
- [x] `destroySessionRecord` lo devuelve en claro y `null` si la sesión no lo tenía.
- [x] Una renovación del access token conserva el `id_token` del login.
- [x] La URL de cierre lleva `id_token_hint` y `post_logout_redirect_uri = {APP_URL}/`.
- [x] Sin `id_token` el cierre de sesión sigue funcionando como antes (vuelve a `/admin`).
- [x] `npm test`, `npm run lint` y `tsc --noEmit` terminan sin errores.
- [ ] Verificación en producción: cerrar sesión y pulsar "Entrar con tu cuenta" muestra el login de base-template.

---

## Decisions

- **Yes:** cifrar el `id_token` como el refresh token: contiene correo y nombre, y solo se usa como pista de cierre.
- **Yes:** volver a la portada `/` tras cerrar sesión: es la URL registrada. Cambiarlo exige registrar otra URL en base-template.
- **Yes:** el cierre local es siempre primero; si el IdP falla, el usuario ya no tiene sesión en Overcity.
- **No:** `prompt=login` ni cambios en el flujo de entrada.
- **No:** guardar el `id_token` en cookies del navegador.

---

## Risks

| Risk | Mitigation |
|---|---|
| `post_logout_redirect_uri` no coincide con la registrada | base-template responde 400 y el usuario ve su página de error; la sesión de Overcity ya está cerrada. Se corrige registrando `{APP_URL}/`. |
| Sesiones abiertas antes de esta spec no tienen `id_token` | Cierran solo la sesión de Overcity (comportamiento anterior) hasta el siguiente login. |
| Cerrar sesión en Overcity saca al usuario de base-template en todos sus dispositivos | Documentado en el SPEC 22 de base-template. |

---

## What is **not** in this spec

- Cierre en otras aplicaciones.
- Otro destino tras el cierre.

Cada uno, si llega, va en su propio spec.
