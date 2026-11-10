---
name: estilo-overcity
description: Mantiene el estilo cyberpunk japonés nocturno de OverCity en todo lo que se construya o modifique en la app (páginas, componentes, panel /admin, modales, botones, iconos, efectos). Úsala siempre que se cree o edite UI, clases de Tailwind, CSS o componentes visuales, y para revisar que un cambio respete la paleta, tipografía y componentes oficiales.
---

# /estilo-overcity — Guardián del estilo de OverCity

Referencia oficial del diseñador: `references/estilo/index.html` y `references/estilo/assets/`. Reglas de negocio completas: sección `Estilo (regla de negocio)` de `CLAUDE.md`. Origen: `specs/04-estilo-cyberpunk-japones.md`.

**Regla de oro:** no se inventan colores, tipografías ni patrones nuevos. Si algo no existe aquí, se compone con los tokens y clases de esta guía.

## Cuándo aplicarla

- Al crear o editar cualquier componente, página, modal o control (incluido `/admin`).
- Al tocar `app/globals.css` o clases de Tailwind.
- Al revisar un diff visual: comprueba la lista de verificación del final.

## Tokens (en `app/globals.css`, expuestos con `@theme`)

| Uso | Token Tailwind | Valor |
| --- | --- | --- |
| Fondo / backdrop | `theme-navy` | `#0A1C29` |
| Acento | `theme-red` | `#D81A21` |
| Borde suave | `border-border-soft` | `rgba(255,255,255,.1)` |
| Texto | `text-white` | `#fff` |
| Fuente | `font-sans` | Inter 400, 600, 800 (`next/font/google`) |

- Neón `#ff294d` / `#ff2448` **solo** para trazos y resplandores (SVG y `drop-shadow`), nunca como relleno de texto o fondo.
- Prohibido: fondos planos claros, grises neutros nuevos, `brand-red`/`brand-navy` (paleta vieja de la SPEC 01), Geist.
- Superficies: translúcidas negras (`bg-black/30`, `bg-black/40`) con `backdrop-blur-md`. Sobre navy usa `bg-theme-navy/90`.

## Tipografía

- Títulos y botones: `font-semibold`.
- Títulos de marca: clase `premium-heading` (`letter-spacing .055em` y `text-shadow` rojo tenue).

## Capas (`z-index`)

Paisaje 0, lluvia 1, humo 2, relámpago 3, pétalos 4, contenido 10 (`relative z-10`), barra del editor 20, botón de música 30, modal 40. El contenido siempre queda por delante de la escena.

## Componentes oficiales

- **Fondo:** `app/_components/night-scene.tsx` (+ `scene-effects.tsx`, canvas, cliente). Debe montarse en toda página nueva, incluida la pantalla de login. Los efectos se pausan con la pestaña oculta y no hay relámpagos con `prefers-reduced-motion: reduce`.
- **Layout:** columna centrada `max-w-md`, `px-4`, móvil primero, sin scroll horizontal a 360 px.
- **Botones de link:** píldora `rounded-full`, `px-6 py-4`, `font-semibold`, clase `catalog-neon` con SVG `neon-outline-svg` (`pathLength="100"`); hover: `motion-safe:hover:-translate-y-1`, borde y fondo `theme-red`, resplandor. Ver `site-view.tsx` (ciclo de neón por turnos de 5 s con N botones).
- **Botones secundarios y de acción:** `rounded-full`, `border border-border-soft bg-black/30`, hover `border-theme-red bg-theme-red/20`. Acción principal: `border-theme-red bg-theme-red/20`, hover `bg-theme-red/40`.
- **Títulos de sección:** `premium-heading` con máscaras `oni-mask` 👺 y 👹 (`aria-hidden`) a los lados.
- **Iconos:** SVG `currentColor` (usar `SocialIcon`), rojo `text-theme-red`, `hover:text-white`, `motion-safe:hover:scale-125`, `drop-shadow-lg`. Tamaños: `size-8` en la fila de redes, `size-7` dentro de botones circulares. Los iconos sin texto llevan `aria-label` (y `title` si ayuda).
- **Botones circulares de icono** (ejemplo: compartir en `share-dialog.tsx`): `size-14 rounded-full border border-border-soft bg-black/30 backdrop-blur-md`, hover `border-theme-red bg-theme-red/20`.
- **Modales:** `<dialog>` con `z-40`, panel `bg-theme-navy`, `border border-theme-red/50`, `rounded-2xl`, `p-6`, sombra roja tenue `shadow-[0_0_30px_rgba(216,26,33,0.2)]`. El backdrop (`rgba(10,28,41,.85)` + `blur(4px)`) ya está en `globals.css`; no lo repitas. Siempre un modal propio: no usar la hoja nativa `navigator.share`.
- **Campos de formulario:** `rounded-full border border-border-soft bg-black/30 text-white backdrop-blur-md`, foco `focus-visible:border-theme-red`.
- **Logo:** `logo-overcity.png` (por defecto) con `drop-shadow-[0_0_12px_rgba(216,26,33,0.48)]`.
- **Música:** `musica-fondo.mp3` con botón flotante de solo icono (altavoz con ondas = sonando, altavoz con X = silenciado), arriba a la izquierda, `size-11` circular, sin texto y con `aria-label`. Intenta sonar al cargar; si el navegador lo bloquea, empieza con la primera interacción. `preload="none"`.

## Foco y accesibilidad

- Foco visible en todo control: `focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red`.
- Texto con contraste mínimo 4.5:1; iconos 3:1.
- `aria-label` en todo control de icono; decoraciones con `aria-hidden`.
- Respetar `prefers-reduced-motion` (`motion-safe:` en hovers con movimiento).

## Contenido editable

Lo que cambia con el tiempo (textos, links, imágenes, logo) vive en `SiteContent` y se edita desde el panel (`specs/02-admin-de-contenido.md`). No se escribe contenido variable a mano en el JSX.

## Activos

Fijos en `public/overcity/` (`logo-overcity.png`, `paisaje-japon-cyberpunk.webp`, `musica-fondo.mp3`). Nombres sin cambios respecto a la referencia.

## Lista de verificación antes de dar un cambio por terminado

1. ¿Solo usa `theme-navy`, `theme-red`, `border-soft`, blanco y neón en trazos? Sin colores nuevos.
2. ¿Las superficies son translúcidas con blur, nunca planas claras?
3. ¿Respeta los `z-index` de las capas?
4. ¿Botones en píldora, iconos rojos → blancos al hover, foco con `outline-theme-red`?
5. ¿Hay `aria-label` en controles de icono y contraste suficiente?
6. ¿Funciona a 360 px sin scroll horizontal y con `prefers-reduced-motion`?
7. ¿Las páginas nuevas montan `NightScene`?
8. `npm run lint` y `npm run build` pasan.

Si una petición del usuario choca con estas reglas, señálalo y propón la variante que sí las cumple; los cambios de estilo "oficial" se hacen primero en `CLAUDE.md` y en esta skill.
