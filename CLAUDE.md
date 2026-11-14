# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js version warning

`AGENTS.md` states this is a Next.js version (16.x) with breaking changes relative to common training data. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices.

## Commands

```bash
npm run dev     # next dev (http://localhost:3000)
npm run build   # next build
npm run start   # next start (after build)
npm run lint    # eslint (flat config in eslint.config.mjs)
```

No test runner is configured.

## Architecture

`create-next-app` project (App Router, TypeScript, Tailwind v4, React 19) that serves the OverCity links page and an admin panel to edit it.

- `/` (`app/page.tsx`) renders `app/_components/site-view.tsx` with `getPublicContent()` (`"use cache"`, tag `content`). Falls back to `DEFAULT_CONTENT` in `lib/links.ts` if Redis is empty or fails.
- `/admin` (`app/admin/`) asks for a password and, with a session, shows the same page in edit mode (`app/admin/_components/editor.tsx`). `saveContent` (`app/admin/actions.ts`) validates, writes to Redis and calls `updateTag("content")`.
- `app/api/logo/route.ts` uploads and removes the logo in Vercel Blob.
- Social networks are a list (`socials`, max 8) chosen from the fixed catalog in `lib/socials.ts`, rendered as a horizontal row of icons (`app/_components/social-icon.tsx`). In the editor each icon is selected to edit its URL, reorder (← →) or remove it.
- Content lives in Redis under `overcity:content:v2`. If it does not exist, `overcity:content:v1` (the SPEC 02 shape with `instagramUrl`) is read and converted in memory; `v1` is never modified.
- Background, music and effects are editable (SPEC 05): `SiteContent` has `background` and `music` (`MediaSetting` = `{ source: "default" | "custom" | "none", url }`) and `effectsEnabled`. `default` = the `public/overcity/` assets (`lib/media.ts`), `custom` = a Vercel Blob URL (validated as `https://*.blob.vercel-storage.com`, max 500 chars), `none` = plain navy background / no music button. Missing fields in stored `v2` are filled with defaults on read (same key). `effectsEnabled: false` does not render `SceneEffects`.
- `app/api/media/route.ts` hands out Vercel Blob client-upload tokens (`handleUpload`) only with a valid `overcity_admin` session (401 otherwise), restricted by path prefix: `background/` (PNG/JPG/WebP, max 5 MB), `music/` (MP3, max 15 MB) or `catalog/` (PNG/JPG/WebP, max 2 MB); limits live in `lib/content-limits.ts`. The browser uploads straight to Blob from `app/admin/_components/media-uploader.tsx` (the 11 MB default MP3 exceeds Vercel's ~4.5 MB function limit); it does not rely on `onUploadCompleted`. Uploading, removing or restoring only changes the draft; `saveContent` deletes the previous Blob file when a `custom` value is replaced (never `public/` assets).
- Product catalog (SPEC 06) lives apart from `SiteContent`: Redis key `overcity:catalog:v1`, cache tag `catalog`. `lib/catalog.ts` (server-only) has validation, Redis access, `getCatalog()` (panel, all products) and `getPublicCatalog()` (`"use cache"`, visible products only); `lib/catalog-shared.ts` holds the types, `CATALOG_CURRENCIES` and `formatPrice` (client-safe). Model: `Catalog` = `{ title, currency, categories[], products[] }`; a product has `name`, `description`, `price` (integer or null), `buyUrl` (http(s) or null), 1–4 Blob `images` (first = cover), `categoryId` (or null) and `visible`. Limits in `lib/content-limits.ts`: 40 products, 10 categories, 4 images per product, 2 MB per image (PNG/JPG/WebP).
- Catalog routes: `/catalogo` (grid by category, 2 columns), `/catalogo/[id]` (detail; hidden or unknown ids call `notFound()`; `generateStaticParams` returns visible ids or a placeholder because `cacheComponents` rejects an empty list; the first request to an id never seen before streams with status 200 and the 404 content, later ones answer 404), `/admin/catalogo` (editor: `app/admin/catalogo/_components/catalog-editor.tsx`, `product-images.tsx`; `saveCatalog` in `app/admin/catalogo/actions.ts` writes Redis first, then deletes unused Blob images, then `updateTag("catalog")`). `/api/media` also accepts the `catalog/` prefix. The home shows an automatic first button to `/catalogo` (text = catalog title) only if there is at least one visible product; it is not a `LinkItem` and does not count toward the 20-link limit (`catalogLabel` prop of `SiteView`).
- `lib/content.ts` holds the `SiteContent` types, validation and Redis access; `lib/auth.ts` holds the signed session cookie and login rate limit; `lib/redis.ts` is the shared Upstash client.
- Content that changes over time (texts, links, images) must live in `SiteContent` and be editable from the panel (see `specs/02-admin-de-contenido.md`).

## Estilo (regla de negocio)

Referencia visual oficial del diseñador: `references/estilo/index.html` y `references/estilo/assets/` (SPEC 04). Todo lo que se construya o pida de ahora en adelante (páginas, componentes, el panel, modales) debe seguir más o menos este mismo estilo. Esta paleta reemplaza la de la SPEC 01. No se inventan colores ni tipografías nuevas.

- **Tema:** cyberpunk japonés nocturno, oscuro, con lluvia, bruma y pétalos de sakura.
- **Colores:** fondo azul marino `#0A1C29` (`theme-navy`); acento rojo `#D81A21` (`theme-red`); texto blanco; borde suave `rgba(255,255,255,0.1)`. Neón rojo `#ff294d` / `#ff2448` solo para trazos y resplandores. Superficies translúcidas negras (`bg-black/30`, `rgba(0,0,0,.38)`) con `backdrop-blur-md`, nunca fondos planos claros.
- **Tipografía:** Inter (400, 600, 800) con `next/font/google`. Títulos y botones en `font-semibold`. Los títulos de marca llevan `letter-spacing: .055em` y `text-shadow` rojo tenue.
- **Fondo:** paisaje `public/overcity/paisaje-japon-cyberpunk.webp` con `blur(1.4px) brightness(.82) saturate(.9)` y degradados marino encima. Capas (`z-index`): paisaje 0, lluvia 1, humo 2, relámpago 3, pétalos 4, contenido 10, botón de música 30, modal 40.
- **Efectos:** lluvia, humo bajo, pétalos y relámpagos en canvas (componentes cliente), pausados con la pestaña oculta. Con `prefers-reduced-motion: reduce` no hay relámpagos y el neón queda fijo.
- **Layout:** columna centrada `max-w-md`, `px-4`, móvil primero, sin scroll horizontal a 360 px.
- **Botones de link:** píldora (`rounded-full`), `px-6 py-4`, `font-semibold`, trazo de neón animado en el perímetro (SVG con `pathLength="100"`) que se ilumina por turnos; al pasar el cursor suben 4 px (`motion-safe:hover:-translate-y-1`), fondo y borde rojos y resplandor.
- **Títulos de sección:** `premium-heading` con máscaras oni 👺 y 👹 flotantes a los lados (`aria-hidden`).
- **Iconos sociales:** SVG `currentColor`, `size-8`, rojo `theme-red`, blancos al hover, `hover:scale-125`, `drop-shadow-lg`.
- **Modales:** `<dialog>` con backdrop `rgba(10,28,41,.85)` y `blur(4px)`, panel marino con `border-theme-red/50`, `rounded-2xl`, `p-6` y sombra roja tenue.
- **Foco y accesibilidad:** `focus-visible:outline-2 outline-offset-4 outline-theme-red`; texto con contraste mínimo 4.5:1 (iconos 3:1); `aria-label` en todo control de icono.
- **Recursos:** logo `logo-overcity.png` con resplandor rojo `drop-shadow-[0_0_12px_rgba(216,26,33,0.48)]`; música `musica-fondo.mp3` con botón flotante de solo icono (altavoz con ondas / silenciado) arriba a la izquierda: intenta sonar al cargar y, si el navegador bloquea el audio automático, empieza con la primera interacción del visitante; `preload="none"`.
- **Controles flotantes:** nunca van encima de contenido ni de barras. En la página pública el botón de música flota arriba a la izquierda (`z-30`); en `/admin` va dentro de la barra de edición (`MusicToggle` con `inline`), porque la barra cambia de alto en móvil. Antes de colocar un control nuevo, revisa dónde queda en `/` y en `/admin` a 360 px.
- Los activos viven en `public/overcity/`. Lo que cambia con el tiempo (logo, textos, links y, desde la SPEC 05, fondo y música) sigue la regla de contenido editable del panel.

## Environment variables

Copy `.env.example` to `.env.local` for local development. In Vercel, `KV_REST_API_*` and `BLOB_READ_WRITE_TOKEN` come from the Upstash Redis and Blob integrations; `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` are added by hand in Settings → Environment Variables.

- `ADMIN_PASSWORD`: password for `/admin`.
- `ADMIN_SESSION_SECRET`: secret that signs the `overcity_admin` session cookie.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`: Upstash Redis (content and login attempt counter).
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob (logo, background and music).

Without Redis the public page still works with the defaults, but in production `/admin` refuses logins.

Non-default setup worth knowing:

- `next.config.ts` enables `cacheComponents` and `partialPrefetching`, plus `experimental.agentFeedback`. `cacheComponents` changes the caching/rendering model, so consult the bundled docs before using data fetching, `"use cache"`, or dynamic APIs.
- Tailwind is wired through Turbopack: `turbopack.rules` in `next.config.ts` runs `*.css` through `@tailwindcss/turbopack`.
- The root layout uses the globally generated `LayoutProps<"/">` type (no import needed); route types come from `.next/types` / `.next/dev/types`, included in `tsconfig.json`.
- Path alias `@/*` maps to the repo root (not `src/`).
- `tsconfig` has `strict: true`.
