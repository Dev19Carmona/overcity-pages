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
- `/admin` (`app/admin/`) is the single admin panel. `layout.tsx` asks for the password and, with a session, wraps every admin page in a sidebar (≥900 px) / top bar (mobile) with `AdminNav` (`Página de links`, and under `Catálogo`: `Productos`, `Categorías`, `Ajustes del catálogo`), links to the site and the store, and logout. `/admin` itself (`app/admin/page.tsx` → `_components/links-admin.tsx`) is a form for the links page: logo, texts, link buttons, socials, background, music and effects; nothing is published until `Guardar` (the logo is published on upload). There is no WYSIWYG edit mode anymore. `app/admin/_lib.ts` has `loadAdminContent()` / `loadAdminCatalog()` (null without session); shared admin UI pieces live in `app/admin/_components/ui.tsx`. `saveContent` (`app/admin/actions.ts`) validates, writes to Redis and calls `updateTag("content")`.
- `app/api/logo/route.ts` uploads and removes the logo in Vercel Blob.
- Social networks are a list (`socials`, max 8) chosen from the fixed catalog in `lib/socials.ts`, rendered as a horizontal row of icons (`app/_components/social-icon.tsx`). In `/admin` each network is a row with its URL, ↑ ↓ and `Quitar`.
- Content lives in Redis under `overcity:content:v2`. If it does not exist, `overcity:content:v1` (the SPEC 02 shape with `instagramUrl`) is read and converted in memory; `v1` is never modified.
- Background, music and effects are editable (SPEC 05): `SiteContent` has `background` and `music` (`MediaSetting` = `{ source: "default" | "custom" | "none", url }`) and `effectsEnabled`. `default` = the `public/overcity/` assets (`lib/media.ts`), `custom` = a Vercel Blob URL (validated as `https://*.blob.vercel-storage.com`, max 500 chars), `none` = plain navy background / no music button. Missing fields in stored `v2` are filled with defaults on read (same key). `effectsEnabled: false` does not render `SceneEffects`.
- `app/api/media/route.ts` hands out Vercel Blob client-upload tokens (`handleUpload`) only with a valid `overcity_admin` session (401 otherwise), restricted by path prefix: `background/` (PNG/JPG/WebP, max 5 MB), `music/` (MP3, max 15 MB) or `catalog/` (PNG/JPG/WebP, max 2 MB); limits live in `lib/content-limits.ts`. The browser uploads straight to Blob from `app/admin/_components/media-uploader.tsx` (the 11 MB default MP3 exceeds Vercel's ~4.5 MB function limit); it does not rely on `onUploadCompleted`. Uploading, removing or restoring only changes the draft; `saveContent` deletes the previous Blob file when a `custom` value is replaced (never `public/` assets).
- Product catalog (SPEC 06, reshaped by SPEC 07) lives apart from `SiteContent`: Redis key `overcity:catalog:v2`, cache tag `catalog`. If `v2` does not exist, `overcity:catalog:v1` (SPEC 06 shape) is read and converted in memory (colors `["Negro"]`, every image `{ url, color: "Negro" }`, stock 0 in every size, `buyUrl` dropped); `v1` is never modified. `lib/catalog.ts` (server-only) has validation, migration, Redis access, `getCatalog()` (panel, all products) and `getPublicCatalog()` (`"use cache"`, visible products only); `lib/catalog-shared.ts` holds the types, the fixed color palette `CATALOG_COLORS`/`CATALOG_COLOR_HEX`, sizes (`CATALOG_SIZES` XS–XL, `ONE_SIZE` "Única"), `sizesFor`, `stockTotal`, `normalizeText`, `CATALOG_CURRENCIES` and `formatPrice` (client-safe). Model: `Catalog` = `{ title, currency, categories[], products[] }`; a category has `id`, `name` and `oneSize`; a product has `name`, `description`, `price` (integer or null), `categoryId` (or null), `visible`, `colors` (1–6 from the palette), `stock` (one integer 0–9999 per size of its category; keys must match `sizesFor(category)`) and 1–8 Blob `images` `{ url, color }` (first = cover, color must be one of the product colors). Limits in `lib/content-limits.ts`: 40 products, 10 categories, 8 images per product, 2 MB per image (PNG/JPG/WebP), `MAX_STOCK` 9999.
- Store routes (SPEC 07): `/catalogo` and `/catalogo/[id]` use `app/_components/store-shell.tsx` (background and effects from `SiteContent`, sticky header with logo, brand and nav; no music button, no cart, no admin lock) and are wide (`STORE_WIDTH`, up to 1240 px). `/catalogo` renders `app/catalogo/_components/catalog-browser.tsx` (client: search without accents by name and category, sort Destacados/precio, category chips, `?categoria=<id>` read with `useSearchParams` inside `Suspense` whose fallback is the unfiltered view so the first HTML already has the products). `/catalogo/[id]` renders `_components/product-detail.tsx` (gallery per color, color and size pickers; no purchase button yet); hidden or unknown ids call `notFound()`; `generateStaticParams` returns visible ids or a placeholder because `cacheComponents` rejects an empty list; the first request to an id never seen before streams with status 200 and the 404 content, later ones answer 404. The home shows an automatic first button to `/catalogo` (text = catalog title) and, below it, one button per category with visible products (cover of its first product, name, count, link `/catalogo?categoria=<id>`) only if there is at least one visible product; none are `LinkItem`s nor count toward the 20-link limit (`catalogLabel` and `catalogCategories` props of `SiteView`).
- Catalog admin (SPEC 07), `/admin/catalogo` inside the `/admin` layout: `page.tsx` (products list: search, category chips, Visible switch, ↑↓ order), `categorias/page.tsx` (create, rename, ↑↓, `oneSize` switch, delete with `<dialog>`), `ajustes/page.tsx` (title and currency), `producto/[id]/page.tsx` (`nuevo` creates; editor in `_components/product-editor.tsx` + `product-images.tsx`: up to 8 images, drag-and-drop upload and reorder, ← → arrows, per-image color, selection mode, undo on delete, colors, stock per size). Each page checks the session through `_lib.ts` (`loadAdminCatalog()`). Server actions in `app/admin/catalogo/actions.ts` (`saveCatalogSettings`, `saveCategories`, `saveProduct`, `deleteProduct`, `setProductVisible`, `moveProduct`): every one requires the session, reads the stored catalog, applies the change, validates the whole catalog, writes Redis first, then deletes Blob images no longer used by any product, then `updateTag("catalog")`. Saving is per product sheet; categories, settings and visibility are saved immediately. `/api/media` accepts the `catalog/` prefix (2 MB per image).
- `lib/content.ts` holds the `SiteContent` types, validation and Redis access; `lib/auth.ts` holds the signed session cookie and login rate limit; `lib/redis.ts` is the shared Upstash client.
- Content that changes over time (texts, links, images) must live in `SiteContent` and be editable from the panel (see `specs/02-admin-de-contenido.md`).

## Estilo (regla de negocio)

Referencia visual oficial del diseñador: `references/estilo/index.html` y `references/estilo/assets/` (SPEC 04). Todo lo que se construya o pida de ahora en adelante (páginas, componentes, el panel, modales) debe seguir más o menos este mismo estilo. Esta paleta reemplaza la de la SPEC 01. No se inventan colores ni tipografías nuevas.

- **Tema:** cyberpunk japonés nocturno, oscuro, con lluvia, bruma y pétalos de sakura.
- **Colores:** fondo azul marino `#0A1C29` (`theme-navy`); acento rojo `#D81A21` (`theme-red`); texto blanco; borde suave `rgba(255,255,255,0.1)`. Neón rojo `#ff294d` / `#ff2448` solo para trazos y resplandores. Superficies translúcidas negras (`bg-black/30`, `rgba(0,0,0,.38)`) con `backdrop-blur-md`, nunca fondos planos claros.
- **Tipografía:** Inter (400, 600, 800) con `next/font/google`. Títulos y botones en `font-semibold`. Los títulos de marca llevan `letter-spacing: .055em` y `text-shadow` rojo tenue.
- **Fondo:** paisaje `public/overcity/paisaje-japon-cyberpunk.webp` con `blur(1.4px) brightness(.82) saturate(.9)` y degradados marino encima. Capas (`z-index`): paisaje 0, lluvia 1, humo 2, relámpago 3, pétalos 4, contenido 10, botón de música 30, modal 40.
- **Efectos:** lluvia, humo bajo, pétalos y relámpagos en canvas (componentes cliente), pausados con la pestaña oculta. Con `prefers-reduced-motion: reduce` no hay relámpagos y el neón queda fijo.
- **Layout:** columna centrada `max-w-md`, `px-4`, móvil primero, sin scroll horizontal a 360 px. Excepción (SPEC 07): la tienda (`/catalogo` y `/catalogo/[id]`) es ancha, hasta 1240 px, con relleno lateral `clamp(14px,3vw,32px)`; la home, los modales y el panel de links siguen en `max-w-md`; `/admin/catalogo` usa barra lateral en ≥900 px.
- **Botones de link:** píldora (`rounded-full`), `px-6 py-4`, `font-semibold`, trazo de neón animado en el perímetro (SVG con `pathLength="100"`) que se ilumina por turnos; al pasar el cursor suben 4 px (`motion-safe:hover:-translate-y-1`), fondo y borde rojos y resplandor.
- **Títulos de sección:** `premium-heading` con máscaras oni 👺 y 👹 flotantes a los lados (`aria-hidden`).
- **Iconos sociales:** SVG `currentColor`, `size-8`, rojo `theme-red`, blancos al hover, `hover:scale-125`, `drop-shadow-lg`.
- **Modales:** `<dialog>` con backdrop `rgba(10,28,41,.85)` y `blur(4px)`, panel marino con `border-theme-red/50`, `rounded-2xl`, `p-6` y sombra roja tenue.
- **Foco y accesibilidad:** `focus-visible:outline-2 outline-offset-4 outline-theme-red`; texto con contraste mínimo 4.5:1 (iconos 3:1); `aria-label` en todo control de icono.
- **Recursos:** logo `logo-overcity.png` con resplandor rojo `drop-shadow-[0_0_12px_rgba(216,26,33,0.48)]`; música `musica-fondo.mp3` con botón flotante de solo icono (altavoz con ondas / silenciado) arriba a la izquierda: intenta sonar al cargar y, si el navegador bloquea el audio automático, empieza con la primera interacción del visitante; `preload="none"`.
- **Controles flotantes:** nunca van encima de contenido ni de barras. En la página pública el botón de música flota arriba a la izquierda (`z-30`); el panel `/admin` y la tienda no tienen botón de música. Antes de colocar un control nuevo, revisa dónde queda en `/` y en `/admin` a 360 px.
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
