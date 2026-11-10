# SPEC 04 — Estilo cyberpunk japonés de la página de links

> **Estado:** Aprobado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03
> **Fecha:** 2026-11-10
> **Objetivo:** Dejar la página `/` (y la vista de `/admin`) visualmente idéntica a la referencia del diseñador en `references/estilo/`, con las mismas imágenes, música y efectos, y registrar ese estilo como regla de negocio en `CLAUDE.md`.

## Por qué existe este spec

El diseñador entregó una versión final de la página en `references/estilo/index.html` (HTML estático con paisaje, efectos, música y botones de neón). Este spec la lleva a la app Next.js sin cambiar su aspecto. También fija ese estilo como norma: todo lo que se agregue de ahora en adelante debe respetar la paleta, los efectos y el lenguaje visual de la referencia (sección de reglas en `CLAUDE.md`).

Reemplaza la paleta de la SPEC 01 (casi negro `#0E1013`, rojo `#D0202A`, azul `#1F3A5F`). El fondo, la música y los efectos editables desde el panel quedan para la SPEC 05; aquí son fijos.

## Alcance

**Dentro:**

- Copiar los activos de `references/estilo/assets/` a `public/overcity/`: `logo-overcity.png`, `paisaje-japon-cyberpunk.webp` y `musica-fondo.mp3`. No se copia `overcity-utilities.css`: Tailwind v4 ya genera esas utilidades.
- Tokens de la referencia en `app/globals.css`: azul marino `#0A1C29` (fondo), rojo `#D81A21` (`theme-red`), blanco, borde suave `rgba(255,255,255,0.1)`. Fuente Inter (400, 600, 800) con `next/font/google`, en lugar de Geist.
- Escena de fondo, en `/` y en la vista de `/admin`: paisaje con desenfoque y tinte azul marino, y las capas de lluvia, humo bajo, pétalos de sakura y destellos de relámpago, con las mismas capas (`z-index`) que la referencia.
- Cabecera con el logo (`logo-overcity.png` por defecto, `h-20`, resplandor rojo) y sin texto `OverCity` ni tagline a la vista.
- Título de sección con las máscaras oni 👺 y 👹 flotantes y ojos rojos brillantes a los lados del texto (`sectionTitle`, por defecto `STREETWEAR`).
- Botones de link tipo píldora con trazo de neón animado que recorre el perímetro. Con 2 botones se ven igual que en la referencia; con N botones se ilumina uno por turno.
- Redes sociales con el estilo de la referencia: icono rojo `theme-red`, blanco al pasar el cursor, crece al pasar el cursor, sombra `drop-shadow-lg`.
- Botón flotante de música `♫ Activar música` abajo a la derecha, con el audio local sin descarga previa (`preload="none"`), sin autoplay y con los estados de la referencia (cargando, pausar, reintentar).
- Botón de compartir y modal de la SPEC 01 **conservados** y restilizados con la paleta nueva (fondo marino, borde y resplandor rojos, botones redondeados), usando las utilidades que ya trae la referencia en `overcity-utilities.css` para ese modal.
- Valores por defecto en `lib/links.ts`: `sectionTitle: "STREETWEAR"`, botones `Camisas (シャツ)` y `Camisillas (タンクトップ)` con los mismos `href`. Las redes y su título no cambian.
- `brandName` deja de mostrarse en la página y pasa a ser el texto alternativo del logo y de los metadatos. `tagline` se retira de la vista y del editor.
- Sección nueva `Estilo (regla de negocio)` en `CLAUDE.md` con la paleta, tipografía, efectos, componentes y reglas que debe cumplir todo contenido futuro.
- Accesibilidad que ya trae la referencia: con `prefers-reduced-motion: reduce` los relámpagos se desactivan y el neón queda encendido y fijo, y el flotado de las máscaras se mantiene como está en la referencia.

**Fuera de alcance (specs futuros):**

- Editar fondo, música o efectos desde el panel (SPEC 05).
- Eliminar el campo `tagline` del modelo y de Redis.
- Migrar o corregir textos ya guardados en Redis (`Camisas 😈`, etc.): se editan desde el panel.
- Cambiar el diseño de la pantalla de clave de `/admin` y de la barra del editor más allá de que se lean sobre el fondo nuevo.
- Sonidos de trueno, más pistas de música o reproducción automática.
- Modo claro.

## Modelo de datos

Esta función no introduce estructuras de datos nuevas. `SiteContent` no cambia: se reutiliza el modelo de las SPEC 02 y 03. Solo cambian valores por defecto y el uso de dos campos:

- `sectionTitle`: por defecto `"STREETWEAR"`.
- `links`: por defecto con las etiquetas `Camisas (シャツ)` y `Camisillas (タンクトップ)`.
- `logoUrl`: `null` ahora significa "usar el logo por defecto `/overcity/logo-overcity.png`", no "sin logo". Subir un logo propio lo reemplaza; `Quitar logo` vuelve al por defecto.
- `brandName`: solo texto alternativo y metadatos. `tagline`: sin uso visible.

Tokens de estilo (en `app/globals.css`, expuestos a Tailwind con `@theme`):

```css
--color-theme-navy: #0A1C29;   /* fondo y backdrop */
--color-theme-red: #D81A21;    /* acento */
--color-border-soft: rgba(255, 255, 255, 0.1);
--font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
```

Convenciones:

- Activos fijos en `public/overcity/`, nombres sin cambios respecto a la referencia.
- Las capas visuales usan estos `z-index`, como la referencia: paisaje `0`, lluvia `1`, humo `2`, relámpago `3`, pétalos `4`, contenido `10`, botón de música `30`, modal `40`.
- Los efectos son componentes cliente (`"use client"`) y se pausan cuando la pestaña está oculta; el resto de la página sigue siendo de servidor.
- Valores de la referencia que se respetan tal cual: paisaje con `blur(1.4px) brightness(.82) saturate(.9)` y degradados marino; lluvia de 62 a 155 gotas según el área; humo con 10 bancos; pétalos de 14 a 24; relámpago cada 11 a 24 s con posible doble destello; neón con trazo de `stroke-dasharray: 24 76` y animación de 4 s.
- Neón con N botones: cada botón se ilumina 4,4 s dentro de su turno de 5 s, el ciclo dura N × 5 s y con 1 solo botón queda siempre encendido.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` las guías de `next/font`, archivos estáticos en `public/`, componentes cliente y `cacheComponents` (aviso de Next.js 16 del `CLAUDE.md`). Copiar los tres activos a `public/overcity/`. Verificación: `/overcity/logo-overcity.png`, `/overcity/paisaje-japon-cyberpunk.webp` y `/overcity/musica-fondo.mp3` responden 200 con `npm run dev`.
2. Reemplazar los tokens de `app/globals.css` por los de la referencia y cambiar Geist por Inter en `app/layout.tsx`; reemplazar los usos de `brand-red` y `brand-navy`. Verificación: `npm run lint` pasa y `/` muestra fondo marino con texto Inter.
3. Crear `app/_components/night-scene.tsx` con el paisaje, los degradados y el contenedor de capas, y montarlo en `site-view.tsx` para `/` y `/admin`. Verificación: se ve el paisaje detrás del contenido a 360 px y a 1280 px.
4. Crear `app/_components/scene-effects.tsx` (cliente) con lluvia, humo, pétalos y relámpagos en canvas, con pausa por visibilidad y sin relámpagos con movimiento reducido. Verificación: los cuatro efectos se ven y la pestaña oculta detiene el consumo de CPU.
5. Restilizar `site-view.tsx`: logo por defecto, título con máscaras oni, botones de neón con ciclo de N botones y redes con el estilo nuevo; actualizar `lib/links.ts` con los nuevos valores por defecto. Verificación: con Redis sin configurar, `/` coincide con `references/estilo/index.html`.
6. Crear `app/_components/music-toggle.tsx` (cliente) con el audio `/overcity/musica-fondo.mp3`, `preload="none"` y los estados de la referencia. Verificación: el audio no se descarga hasta pulsar el botón y alterna entre reproducir y pausar.
7. Restilizar `share-dialog.tsx` con la paleta nueva, con el botón arriba a la derecha y el modal con backdrop marino desenfocado. Verificación: el modal abre y cierra por Esc, clic fuera y botón, y copia el enlace.
8. Adaptar `app/admin/_components/editor.tsx` (y `login-form.tsx`) para que el editor use la misma vista, sin campo de tagline, y los controles se lean sobre el fondo nuevo. Verificación: `/admin` con sesión se ve como `/` más la barra y los controles de edición, y guardar sigue funcionando.
9. Agregar a `CLAUDE.md` la sección `Estilo (regla de negocio)`. Verificación: el texto coincide con los tokens y componentes del código.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] Con Redis sin configurar, `/` a 360 px y a 1280 px coincide con `references/estilo/index.html` abierto a esos anchos: mismo paisaje, logo, título, botones y redes. Las únicas diferencias permitidas son el botón de compartir y la vista de `/admin`.
- [ ] La página usa los archivos `/overcity/logo-overcity.png` y `/overcity/paisaje-japon-cyberpunk.webp`, idénticos byte a byte a los de `references/estilo/assets/`.
- [ ] Hay lluvia, humo, pétalos y relámpagos visibles, y el contenido queda por delante de todos.
- [ ] Con `prefers-reduced-motion: reduce` no hay relámpagos y el neón queda encendido fijo.
- [ ] El título muestra `STREETWEAR` con 👺 a la izquierda y 👹 a la derecha, marcados con `aria-hidden`.
- [ ] Con 2 botones, el neón recorre primero `Camisas (シャツ)` y luego `Camisillas (タンクトップ)`, en un ciclo de 10 s.
- [ ] Con 3 botones el ciclo dura 15 s y cada botón se ilumina uno por turno; con 1 botón queda siempre encendido.
- [ ] El icono de Instagram es rojo `#D81A21`, pasa a blanco con el cursor y crece al pasar el cursor.
- [ ] El botón `♫ Activar música` está abajo a la derecha, el MP3 no se pide al cargar la página y se pide al pulsarlo; pulsarlo de nuevo pausa y el texto cambia a `♫ Pausar música`.
- [ ] Si falla la carga del audio, el botón muestra `♫ Reintentar música`.
- [ ] El botón de compartir sigue arriba a la derecha y su modal abre con Copiar enlace, WhatsApp, Facebook, X, Telegram y Email, con la paleta nueva y cierra con Esc, clic fuera y botón.
- [ ] En `/admin` con sesión se ve la misma escena de fondo, sin campo de tagline, y editar, agregar, quitar, reordenar y guardar siguen funcionando.
- [ ] Sin logo propio, `/` muestra `logo-overcity.png`; tras subir uno propio se ve ese, y `Quitar logo` vuelve al por defecto.
- [ ] Todo texto cumple contraste mínimo 4.5:1 y los iconos rojos de redes cumplen 3:1 sobre el fondo.
- [ ] No hay scroll horizontal a 360 px en `/` ni en `/admin`.
- [ ] `CLAUDE.md` contiene la sección `Estilo (regla de negocio)` con paleta, tipografía, efectos y reglas.

## Decisiones

- **Sí:** reproducir la referencia tal cual en `/` y dejarla como norma visual. Fue la instrucción explícita del usuario.
- **Sí:** conservar el botón de compartir y el modal, restilizados. La referencia no los trae, pero el usuario pidió mantenerlos.
- **No:** copiar `overcity-utilities.css` al proyecto. Duplicaría lo que Tailwind v4 ya genera y chocaría con `app/globals.css`.
- **Sí:** logo con valor por defecto empaquetado. Mantiene el logo editable (regla de la SPEC 02) y hace que la página nunca quede sin logo.
- **Sí:** `brandName` solo como `alt` y metadatos, `tagline` fuera de la vista. La referencia no los muestra.
- **No:** quitar `tagline` del modelo ahora. Evita tocar `overcity:content:v2` y se retira en otro spec.
- **Sí:** ciclo secuencial de neón para N botones, 5 s por turno. Con 2 botones reproduce la referencia y con más escala sin romper la regla de hasta 20 botones.
- **No:** limitar a 2 botones ni encender todos a la vez. Lo primero contradice la SPEC 02 y lo segundo cambia la referencia.
- **Sí:** solo cambiar los valores por defecto, sin migrar Redis. Si hay textos viejos guardados, los corrige el administrador desde el panel.
- **Sí:** activos fijos en `public/overcity/` en este spec. La edición de fondo y música es la SPEC 05, porque exige subida directa a Blob.
- **Sí:** Inter con `next/font/google`. Es la fuente de la referencia y se sirve sin llamadas externas en tiempo de ejecución.
- **Sí:** estilo registrado en `CLAUDE.md` como regla de negocio. Fue petición explícita del usuario.
- **Sí:** esta paleta reemplaza la de la SPEC 01. La SPEC 01 no se edita.
- **Sí:** dividir el trabajo en SPEC 04 (estilo) y SPEC 05 (medios editables). Son más de tres áreas y la 04 por sí sola ya entrega la página igual a la referencia.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| La referencia trae un script que falla al buscar elementos del modal de compartir que no existen | No se copia el script tal cual: se porta por componentes y el modal se conecta a su propio botón. |
| Los efectos de canvas gastan batería o CPU en móviles | Se limita el DPR como en la referencia, se pausan con la pestaña oculta y los relámpagos respetan `prefers-reduced-motion`. |
| El MP3 de 11 MB consume datos | `preload="none"`: solo se descarga al pulsar `Activar música`. |
| El MP3 queda duplicado en el repositorio (`references/` y `public/`) | Aceptado; la carpeta `references/` es la fuente del diseñador y `public/` es lo que se sirve. |
| Los textos viejos guardados en Redis (`😈`) no cambian con los defaults | Se corrigen desde `/admin`; queda documentado en Decisiones. |
| El icono rojo `#D81A21` sobre `#0A1C29` no llega a 4.5:1 | Son iconos, no texto: se exige 3:1 y llevan `aria-label`. |
| `cacheComponents` cambia el modelo de renderizado | Los efectos son componentes cliente sin datos dinámicos; la página sigue leyendo contenido con `"use cache"`. |
| El neón con muchos botones pierde la sincronía con el ciclo | La duración y el retardo se calculan por botón desde N, y se verifica con 1, 2, 3 y 20 botones. |

## Lo que **no** está en este spec

- Editar fondo, música o efectos desde el panel (SPEC 05).
- Quitar `tagline` del modelo.
- Migrar textos ya guardados en Redis.
- Rediseñar la pantalla de clave o la barra del editor.
- Trueno, más pistas o música automática.
- Modo claro.

Cada uno, si se hace, va en su propio spec.
