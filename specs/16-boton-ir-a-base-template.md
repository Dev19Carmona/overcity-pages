# SPEC 16 — Botón «Ir a base-template» en el panel

> **Status:** Aprobado
> **Depends on:** SPEC 13, SPEC 15; SPEC 21 de base-template (portal de aplicaciones)
> **Date:** 2026-11-23
> **Objective:** Añadir a la barra lateral del panel `/admin` un botón que lleve al usuario a base-template (el frontend donde gestiona su cuenta y ve «Tus aplicaciones»).

---

## Scope

**In:**

- Un enlace con el estilo `sideLink` en `app/admin/layout.tsx`, junto a «Ver sitio» y «Ver tienda», con texto «Ir a base-template» (solo icono + texto accesible en móvil, como los demás).
- Una variable de entorno **de servidor** `PLATFORM_URL` con la URL pública del frontend de base-template.
- Si `PLATFORM_URL` falta o no es una URL `http(s)` válida, el botón **no se renderiza** (el panel sigue funcionando).
- Documentar la variable en `.env.example` y en `CLAUDE.md` del repo.

**Out of scope (para futuros specs):**

- Mostrar el botón en la portada pública `/` o en `/catalogo`.
- Abrir el enlace en pestaña nueva.
- Pasar contexto al destino (empresa, ruta profunda, `login_hint`).
- Cambiar el flujo SSO o añadir rutas nuevas en Overcity.

---

## Data model

Sin datos nuevos. Solo una variable de entorno:

```
PLATFORM_URL=https://<frontend-de-base-template>   # sin barra final; solo servidor, nunca NEXT_PUBLIC_
```

---

## Implementation plan

1. Crear `lib/platform.ts` con `getPlatformUrl(): string | null`: lee `process.env.PLATFORM_URL`, valida con `new URL()` que el protocolo sea `http:` o `https:` y devuelve la URL normalizada; en cualquier otro caso `null`.
2. Añadir `PLATFORM_URL` a `.env.example` con su comentario.
3. En `app/admin/layout.tsx`, llamar a `getPlatformUrl()` en `Gate` y, si no es `null`, renderizar un `<a href={url} className={sideLink}>` con `<span aria-hidden="true">⌂</span>`, texto visible en escritorio y `sr-only` en móvil. Va antes del bloque del nombre y de «Cerrar sesión».
4. Prueba `tests/platform.test.ts` para `getPlatformUrl`: variable ausente, vacía, sin protocolo, `javascript:`, `http://localhost:4200`, `https://x.com/` (normaliza).
5. Actualizar `CLAUDE.md` (variable y botón).

---

## Acceptance criteria

- [ ] Con `PLATFORM_URL` válida, la barra lateral de `/admin` muestra «Ir a base-template» y su `href` es esa URL.
- [ ] Al pulsarlo se navega en la misma pestaña.
- [ ] Sin `PLATFORM_URL`, o con un valor inválido (`javascript:`, texto sin protocolo), el botón no aparece y `/admin` carga sin errores.
- [ ] En móvil (<900 px) se ve solo el icono y el texto «Ir a base-template» queda disponible para lector de pantalla.
- [ ] El botón tiene el mismo estilo y anillo de foco que «Ver sitio».
- [ ] El botón no aparece en `/` ni en `/catalogo`.
- [ ] `PLATFORM_URL` no está en el bundle del cliente (no lleva prefijo `NEXT_PUBLIC_`).
- [ ] `npm test`, `npm run lint` y `tsc --noEmit` terminan sin errores.

---

## Decisions

- **Yes:** ubicarlo en la barra lateral del admin. Solo lo ve quien ya inició sesión; el botón de la portada expondría la plataforma a los clientes finales de Overcity.
- **Yes:** variable de entorno propia `PLATFORM_URL`. `AUTH_ISSUER` es el backend (`/oidc`), no necesariamente el frontend Angular, y una URL fija obligaría a editar código por entorno.
- **Yes:** variable de servidor (sin `NEXT_PUBLIC_`): `Gate` es un Server Component y no hace falta exponerla al navegador.
- **Yes:** ocultar el botón si la URL no es válida, en lugar de romper el panel o mostrar un enlace roto. Validar el protocolo evita un `javascript:` por mala configuración.
- **Yes:** misma pestaña. Base-template muestra «Tus aplicaciones» con la tarjeta de Overcity para volver (SPEC 21).
- **No:** pestaña nueva, ruta intermedia ni SSO adicional: el usuario ya tiene sesión en base-template o se le pedirá la clave allí.

---

## Risks

| Risk | Mitigation |
|---|---|
| Tras SPEC 15, si el usuario cerró sesión en base-template, el botón lo lleva al login de base-template | Es el comportamiento esperado; tras entrar ve el portal. |
| `PLATFORM_URL` mal configurada en Vercel apunta a un sitio equivocado | Se documenta en `.env.example`; se verifica manualmente tras el despliegue. |

---

## What is **not** in this spec

- Botón en la portada o en la tienda.
- Pestaña nueva o enlaces profundos.
- Cambios en base-template ni en el flujo SSO.

Cada uno, si llega, va en su propio spec.
