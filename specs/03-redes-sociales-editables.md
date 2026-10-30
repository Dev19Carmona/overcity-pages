# SPEC 03 — Redes sociales editables desde el panel

> **Estado:** Borrador
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-10-30
> **Objetivo:** Reemplazar el único icono de Instagram por una lista de hasta 8 redes sociales que se agregan, quitan, reordenan y editan desde el panel `/admin` y se muestran con su icono en la página pública.

## Por qué existe este spec

La SPEC 02 dejó `instagramUrl` como el único dato de redes sociales y dejó fuera "más redes sociales además de Instagram". Este spec lo cubre. Se implementa después de que la SPEC 02 esté terminada y unida a `master`, porque cambia el modelo `SiteContent` que ella introduce.

## Alcance

**Dentro:**

- Lista de redes sociales en el contenido, de 0 a 8 elementos, mostrada en la sección de redes de la página pública como una fila de iconos enlazados.
- Catálogo fijo de redes, cada una con su icono: Instagram, Facebook, TikTok, WhatsApp, YouTube, X, Telegram, Email y Web.
- Cada red tiene una sola URL completa que se pega tal cual (por ejemplo `https://wa.me/573001234567` o `mailto:correo@dominio.com`).
- Título de la sección de redes editable (`socialsTitle`), hoy fijo como `Redes sociales` en `app/_components/site-view.tsx`.
- En `/admin`, dentro del modo edición de la SPEC 02:
  - Botón `+ Agregar red` con selector del catálogo.
  - Editar la URL de cada red.
  - Reordenar con `↑` y `↓`, y `Quitar`, igual que los botones.
  - Editar el título de la sección.
- Los enlaces http(s) abren en pestaña nueva (`target="_blank"` con `rel="noopener noreferrer"`); los `mailto:` no.
- Cada icono tiene `aria-label` con el nombre de la red (por ejemplo `Instagram`).
- Migración automática del contenido de la SPEC 02: el `instagramUrl` guardado pasa a ser la primera red de la lista.
- Validación en servidor de redes, URLs y cantidad, con los mismos mensajes de error del panel.

**Fuera de alcance (specs futuros):**

- Escribir solo el usuario o número y que la app arme la URL de cada red.
- Redes fuera del catálogo o iconos propios subidos por el usuario.
- Cambiar las redes del modal de compartir de la SPEC 01.
- Arrastrar y soltar para reordenar.
- Colores de marca por red (los iconos usan el color del texto de la página).
- Analítica de clics en las redes.
- Otros cambios de experiencia del panel que no sean de redes sociales.

## Modelo de datos

Cambia `SiteContent` en `lib/content.ts`: se elimina `instagramUrl` y se agregan `socialsTitle` y `socials`.

```ts
export type SocialNetwork =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "whatsapp"
  | "youtube"
  | "x"
  | "telegram"
  | "email"
  | "web";

export type SocialItem = {
  id: string; // uuid generado al agregar la red
  network: SocialNetwork;
  url: string; // http(s) para todas; mailto: solo para "email"
};

export type SiteContent = {
  brandName: string;
  tagline: string;
  sectionTitle: string;
  logoUrl: string | null;
  socialsTitle: string; // "Redes sociales"
  socials: SocialItem[]; // el orden del arreglo es el orden en pantalla
  links: LinkItem[];
};
```

El catálogo vive en `lib/socials.ts`:

```ts
export const SOCIAL_NETWORKS: Record<SocialNetwork, { label: string; mailto?: boolean }> = {
  instagram: { label: "Instagram" },
  // facebook, tiktok, whatsapp, youtube, x, telegram, web
  email: { label: "Email", mailto: true },
};
```

Valores por defecto en `lib/links.ts`: `socialsTitle: "Redes sociales"` y `socials` con una sola red, `instagram`, con `https://www.instagram.com/overcitystreetwear/`.

Persistencia:

- Clave nueva `overcity:content:v2` en Redis. La `v1` de la SPEC 02 no se modifica ni se borra.
- Lectura: se lee `v2`; si no existe, se lee `v1` y se convierte en memoria (`instagramUrl` pasa a `socials[0]` como `instagram`, `socialsTitle` toma el valor por defecto). La primera vez que se guarda desde el panel se escribe `v2`.
- `replaceLogoUrl` y `saveContent` escriben siempre en `v2`.

Límites de validación (en `lib/content-limits.ts`):

- `MAX_SOCIALS = 8`.
- `socialsTitle` hasta 60 caracteres, como los demás títulos.
- `url` hasta 500 caracteres; para `email` debe empezar por `mailto:` y para las demás por `http://` o `https://`.
- Se permiten dos redes del mismo tipo (por ejemplo dos cuentas de Instagram).

Convenciones:

- Los iconos son SVG en línea (`app/_components/social-icon.tsx`), sin dependencias nuevas, con `currentColor`.
- Las variables de entorno no cambian.

## Plan de implementación

1. Crear `lib/socials.ts` con el tipo `SocialNetwork` y el catálogo, agregar `MAX_SOCIALS` a `lib/content-limits.ts` y crear `app/_components/social-icon.tsx` con los 9 iconos. Verificación: `npm run lint` pasa y nada visible cambia.
2. Cambiar el modelo en `lib/content.ts` y `lib/links.ts`: tipos `SocialItem` y `SiteContent`, validación, clave `v2` con lectura de `v1` y migración, y `replaceLogoUrl`. Hacer que `app/_components/site-view.tsx` muestre `socialsTitle` y los iconos de `socials`, y que `app/admin/_components/editor.tsx` edite `socialsTitle` y la URL de cada red existente. Verificación: con el contenido de la SPEC 02 guardado en `v1`, `/` sigue mostrando el icono de Instagram y `/admin` permite editar su URL; guardar escribe `v2`.
3. Agregar en `app/admin/_components/editor.tsx` el botón `+ Agregar red` con selector, `↑`, `↓` y `Quitar` por red. Verificación: se agregan, ordenan y quitan redes en pantalla y el límite de 8 deshabilita el botón.
4. Actualizar `CLAUDE.md` con el nuevo modelo y la clave `v2`. Verificación: el texto coincide con el código.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] Con contenido guardado solo en `overcity:content:v1`, `/` muestra el icono de Instagram con la URL anterior y `/admin` muestra esa red en la lista.
- [ ] Tras la primera edición guardada, existe `overcity:content:v2` y `overcity:content:v1` no cambió.
- [ ] El selector de `+ Agregar red` ofrece exactamente Instagram, Facebook, TikTok, WhatsApp, YouTube, X, Telegram, Email y Web.
- [ ] Una red agregada y guardada aparece en `/` con su icono propio.
- [ ] Se pueden quitar y reordenar redes, y el orden guardado es el que se ve en `/`.
- [ ] Con 8 redes, `+ Agregar red` está deshabilitado, y un guardado con 9 redes enviado al servidor se rechaza.
- [ ] Una red `email` con URL `mailto:correo@dominio.com` se guarda y su enlace no se abre en pestaña nueva.
- [ ] Una red `email` con URL `https://…` se rechaza con mensaje de error.
- [ ] Una red que no es `email` con URL `mailto:` o sin `http(s)://` se rechaza con mensaje de error.
- [ ] Un tipo de red fuera del catálogo enviado al servidor se rechaza.
- [ ] Los enlaces `http(s)` de las redes abren en pestaña nueva y la página original sigue abierta.
- [ ] Cada icono de red tiene `aria-label` con el nombre de la red y es alcanzable con Tab.
- [ ] El título de la sección de redes se edita y se guarda, y se ve en `/`.
- [ ] Con 0 redes, `/` no muestra la sección de redes ni su título.
- [ ] Todo el texto cumple contraste mínimo 4.5:1 y no hay scroll horizontal a 360 px en `/` ni en `/admin` con 8 redes.

## Decisiones

- **Sí:** catálogo fijo con iconos. Cada red se ve reconocible y no hay iconos genéricos que parezcan descuidados.
- **No:** opción `Otra` con icono genérico. No se pidió y el catálogo ya incluye `Web` para cualquier otro enlace.
- **Sí:** URL completa, no usuario. Evita mantener las reglas de URL de cada red y se valida con el mismo criterio que los botones.
- **No:** campo de usuario o número que arme la URL. Queda para otro spec si hace falta.
- **Sí:** hasta 8 redes con agregar, quitar y reordenar, igual que los botones. Es el mismo patrón y no obliga a aprender otro.
- **Sí:** `socialsTitle` editable. Sigue la regla de la SPEC 02: lo que cambia con el tiempo se edita desde el panel.
- **Sí:** clave `v2` con lectura de `v1`. Permite volver atrás con la versión anterior del código sin perder datos, y es para lo que sirve la clave versionada.
- **No:** migrar escribiendo sobre `v1`. Una vuelta atrás dejaría contenido que la SPEC 02 ya no sabe leer.
- **Sí:** se permiten redes repetidas. Una marca puede tener dos cuentas de la misma red.
- **Sí:** SVG en línea en vez de una librería de iconos. Son 9 iconos y no justifica una dependencia.
- **No:** colores de marca. Los iconos usan el color del texto para mantener la paleta de la SPEC 01.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| La migración de `v1` a `v2` falla o pierde `instagramUrl` | La conversión es solo en memoria; `v1` no se toca. Si la lectura falla, se usan los valores por defecto como en la SPEC 02. |
| Se despliega este código antes de unir la SPEC 02 | Dependencia declarada: se implementa sobre `master` ya con la SPEC 02. |
| Un `mailto:` mal formado o un `javascript:` en la URL | Validación en servidor: `http(s)` para todas las redes salvo `email`, que exige `mailto:`. |
| Los iconos de marca tienen licencias distintas | Usar glifos de una fuente de licencia libre (por ejemplo Simple Icons, CC0) y anotar el origen en `social-icon.tsx`. |
| Fila de 8 iconos desborda a 360 px | Los iconos se distribuyen con `flex-wrap`; se comprueba en los criterios. |
| Se guarda con redes sin URL válida | El servidor rechaza el guardado con mensaje y no cambia lo publicado. |

## Lo que **no** está en este spec

- Usuario o número como dato en vez de la URL completa.
- Redes fuera del catálogo o iconos subidos.
- Cambios al modal de compartir.
- Arrastrar y soltar, colores de marca y analítica de clics.
- Otras mejoras de experiencia del panel.

Cada uno, si se hace, va en su propio spec.
