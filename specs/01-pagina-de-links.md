# SPEC 01 — Página de links de OverCity (estilo Linktree)

> **Estado:** Implementado
> **Depende de:** ninguno
> **Fecha:** 2026-10-30
> **Objetivo:** Reemplazar la página por defecto de Next.js con una página de links de OverCity que abre los catálogos de Camisas y Camisillas en pestaña nueva, permite compartir la página en redes y vuelve a Instagram.

## Por qué existe este spec

Hoy los catálogos (flipbooks de Heyzine) se publican desde un Linktree. Esta página los saca de Linktree y los deja bajo el control de OverCity, con su propia paleta. La gestión sencilla de los botones (cambiar un link, agregar uno nuevo) se deja para el siguiente spec; aquí los links viven en un único archivo de datos.

## Alcance

**Dentro:**

- Página única en `/` (`app/page.tsx`) que reemplaza la plantilla por defecto de `create-next-app`.
- Cabecera con el texto `OverCity` y `STREETWEAR`, **sin logo** (se agrega después).
- Icono de Instagram bajo la cabecera, que abre `https://www.instagram.com/overcitystreetwear/` en pestaña nueva.
- Título de sección `😈 Overcity Premium 😈`.
- Dos botones, solo texto y sin miniatura, que abren en pestaña nueva (`target="_blank"` con `rel="noopener noreferrer"`):
  - `Camisas 😈` → `https://heyzine.com/flip-book/17a9864401.html`
  - `Camisillas 😈` → `https://heyzine.com/flip-book/af8d607512.html`
- Botón destacado `Volver a Instagram` hacia el mismo perfil, en pestaña nueva.
- Botón de compartir arriba a la derecha que abre un modal con: Copiar enlace, WhatsApp, Facebook, X, Telegram y Email. En dispositivos que soporten Web Share API, el botón abre primero el menú nativo; si el usuario cancela o no hay soporte, se muestra el modal.
- Paleta oscura derivada del logo (ver Modelo de datos), con diseño elaborado usando la skill `frontend-design` durante la implementación.
- Metadata de la página (`title`, `description`, Open Graph básico) y `lang="es"` en el layout.
- Diseño responsive, pensado primero para móvil.

**Fuera de alcance (specs futuros):**

- **Gestión de botones:** cómo cambiar un link fácilmente o agregar/quitar botones nuevos (panel, archivo de configuración, CMS, etc.). Es el tema del **siguiente spec**.
- Logo / avatar con aro de Instagram (se agrega después; la cabecera deja el espacio preparado).
- Miniaturas en los botones.
- Facebook Messenger, LinkedIn, Snapchat y otras redes (requieren SDK o claves, o aportan poco).
- Analítica de clics.
- Imagen Open Graph personalizada.
- Footer tipo "Consigue tu propio Linktree" y enlaces legales.

## Modelo de datos

Los links viven en `lib/links.ts` como constantes tipadas. No hay persistencia ni backend.

```ts
export type LinkItem = {
  id: string;
  label: string; // texto visible, incluye el emoji
  href: string;
};

export const INSTAGRAM_URL = "https://www.instagram.com/overcitystreetwear/";

export const CATALOG_LINKS: LinkItem[] = [
  { id: "camisas", label: "Camisas 😈", href: "https://heyzine.com/flip-book/17a9864401.html" },
  { id: "camisillas", label: "Camisillas 😈", href: "https://heyzine.com/flip-book/af8d607512.html" },
];
```

Paleta, definida como variables CSS en `app/globals.css` (valores aproximados tomados del logo; se ajustan por contraste en la implementación):

- Fondo: casi negro (`~#0E1013`) con degradado rojo tenue en la parte superior.
- Rojo OverCity (sol del logo): `~#D0202A`.
- Azul marino OverCity (texto del logo): `~#1F3A5F`.
- Texto: blanco `#FFFFFF`.
- Borde de botones: blanco con baja opacidad.

Convenciones:

- La URL que se comparte es siempre la de la página actual (`window.location.href`), leída en el cliente al abrir el modal.
- El modal de compartir es un componente cliente (`"use client"`); el resto de la página es de servidor.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` las guías de metadata, componentes cliente y `cacheComponents`, por el aviso de Next.js 16 del `CLAUDE.md`.
2. Crear `lib/links.ts` con `INSTAGRAM_URL` y `CATALOG_LINKS`. Verificación: `npm run lint` pasa.
3. Definir los tokens de la paleta en `app/globals.css` y ajustar `app/layout.tsx` (`lang="es"`, metadata). Verificación: `npm run dev` carga sin errores.
4. Reemplazar `app/page.tsx` con la estructura estática: cabecera `OverCity` / `STREETWEAR`, icono de Instagram, título de sección y los dos botones desde `CATALOG_LINKS`. Verificación: los botones abren los flipbooks en pestaña nueva.
5. Agregar el botón `Volver a Instagram` y dar el acabado visual con la skill `frontend-design`. Verificación: se ve bien a 360 px y a 1280 px de ancho.
6. Crear `app/_components/share-dialog.tsx` (cliente): botón de compartir, modal y enlaces de Copiar enlace, WhatsApp, Facebook, X, Telegram y Email. Verificación: cada enlace abre la red correspondiente con la URL de la página.
7. Integrar Web Share API como primera opción y el cierre del modal con Esc, clic fuera y botón de cerrar. Verificación manual en móvil y escritorio.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] `/` ya no muestra la plantilla de `create-next-app`.
- [ ] Se ve el texto `OverCity` y `STREETWEAR` y no hay ningún logo.
- [ ] Clic en `Camisas 😈` abre `https://heyzine.com/flip-book/17a9864401.html` en una pestaña nueva y la página original sigue abierta.
- [ ] Clic en `Camisillas 😈` abre `https://heyzine.com/flip-book/af8d607512.html` en una pestaña nueva y la página original sigue abierta.
- [ ] El icono de Instagram y el botón `Volver a Instagram` abren `https://www.instagram.com/overcitystreetwear/` en pestaña nueva.
- [ ] El botón de compartir está arriba a la derecha y abre un modal con Copiar enlace, WhatsApp, Facebook, X, Telegram y Email.
- [ ] `Copiar enlace` deja la URL de la página en el portapapeles y muestra confirmación visible.
- [ ] Cada red del modal abre con la URL de la página ya incluida.
- [ ] El modal se cierra con Esc, con clic fuera y con el botón de cerrar.
- [ ] Los botones son alcanzables con teclado (Tab) y tienen `aria-label` o texto accesible, incluidos los de icono.
- [ ] No hay scroll horizontal a 360 px de ancho.
- [ ] Todo el texto cumple contraste mínimo 4.5:1 sobre el fondo.
- [ ] Cambiar un `href` en `lib/links.ts` se refleja en la página sin tocar otro archivo.

## Decisiones

- **Sí:** modal propio con URLs de compartir (`wa.me`, `facebook.com/sharer`, `x.com/intent/post`, `t.me/share`, `mailto:`). No requiere SDK, claves ni cuentas de desarrollador.
- **Sí:** Web Share API como primera opción en móvil. Es la experiencia más natural donde existe, con el modal como respaldo.
- **No:** Messenger, LinkedIn y Snapchat, aunque aparecen en Linktree. Messenger exige un `app_id` de Facebook y las otras aportan poco a una marca de ropa.
- **Sí:** etiquetas `Camisas` y `Camisillas`, como en el Linktree actual. En la conversación también se dijo "camisetas", y se confirmó `Camisas`.
- **Sí:** Instagram como icono bajo la cabecera y también como botón `Volver a Instagram`. El icono mantiene la referencia visual; el botón es explícito.
- **Sí:** paleta oscura con rojo y azul del logo, como la referencia de Linktree.
- **Sí:** usar la skill `frontend-design` en la implementación, por petición del usuario.
- **Sí:** emojis 😈 igual que en el Linktree actual.
- **No:** logo por ahora. La cabecera queda sin avatar y se agrega en un spec posterior.
- **No:** miniaturas en los botones. No existen las imágenes y no aportan al objetivo.
- **Sí:** links en `lib/links.ts` como constantes. Es lo mínimo para este spec y deja el terreno listo para el spec de gestión.
- **No:** panel de administración, CMS ni base de datos. Se decide en el siguiente spec.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Clipboard API no disponible o sin HTTPS (en `http://` local distinto de `localhost`) | Fallback con `document.execCommand("copy")` o campo de texto seleccionable. |
| Web Share API falla o se cancela | La cancelación no es error: se muestra el modal. Si no existe, se muestra el modal directo. |
| Los emojis se ven distinto según el sistema operativo | Aceptado; no se sustituyen por imágenes. |
| `cacheComponents` activo cambia el modelo de renderizado | Página estática sin datos dinámicos; `window.location` se lee solo en el componente cliente, al abrir el modal. |
| Los flipbooks de Heyzine bloquean o cambian su URL | Fuera de control de este spec; se actualiza el `href` en `lib/links.ts`. |

## Lo que **no** está en este spec

- Gestión de botones: cambiar links fácilmente, agregar o quitar botones. Es el siguiente spec.
- Logo o avatar.
- Miniaturas en los botones.
- Redes adicionales (Messenger, LinkedIn, Snapchat).
- Analítica, imagen Open Graph propia y footer legal.

Cada uno, si se hace, va en su propio spec.
