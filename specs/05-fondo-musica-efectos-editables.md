# SPEC 05 — Fondo, música y efectos editables desde el panel

> **Estado:** Aprobado
> **Depende de:** SPEC 02, SPEC 03, SPEC 04
> **Fecha:** 2026-11-10
> **Objetivo:** Permitir cambiar, quitar y restaurar desde `/admin` la imagen de fondo y la música, y activar o desactivar los efectos de la escena, usando por defecto los activos de la SPEC 04.

## Por qué existe este spec

La SPEC 04 dejó el paisaje, la música y los efectos fijos en `public/overcity/`. La regla de la SPEC 02 pide que lo que cambia con el tiempo se edite desde el panel, y el usuario pidió que el fondo y la música lo sean, con los de la referencia como valores por defecto. El MP3 por defecto pesa 11 MB y las rutas del servidor de Vercel aceptan unos 4,5 MB. Por eso estos archivos se suben directo del navegador a Vercel Blob, con un token que solo entrega el servidor a quien tenga sesión.

## Alcance

**Dentro:**

- En `/admin`, en modo edición:
  - Control de **imagen de fondo**: subir, cambiar, quitar (fondo marino liso) y restaurar el paisaje por defecto.
  - Control de **música**: subir, cambiar, quitar (el botón `♫` deja de mostrarse) y restaurar la música por defecto.
  - Interruptor de **efectos** (lluvia, humo, pétalos y relámpagos), activado por defecto.
- Fondo: PNG, JPG o WebP de hasta 5 MB. Música: MP3 de hasta 15 MB.
- Subida directa del navegador a Vercel Blob con `@vercel/blob/client`, con token generado por `app/api/media/route.ts` solo si hay sesión válida, con tipo y tamaño restringidos.
- La página pública y la vista de `/admin` usan lo guardado; si no hay nada guardado, usan los activos por defecto de la SPEC 04.
- Al reemplazar, quitar o restaurar, se borra el archivo anterior de Blob (solo si estaba en Blob, nunca el de `public/`).
- Validación en servidor de los nuevos campos, con los mismos mensajes de error del panel.
- Actualizar `CLAUDE.md` con el nuevo modelo y la ruta de subida.

**Fuera de alcance (specs futuros):**

- Varias pistas, lista de reproducción, volumen editable o reproducción automática.
- Editar la intensidad o cada efecto por separado.
- Fondo en video o animado, o un fondo distinto por dispositivo.
- Recorte, redimensionado o compresión de imágenes y audio.
- Editar el texto del botón de música.
- Cambiar el logo, que sigue con la subida de la SPEC 02.

## Modelo de datos

Cambia `SiteContent` en `lib/content.ts`: se agregan `background`, `music` y `effectsEnabled`. La clave de Redis sigue siendo `overcity:content:v2`: son campos que se agregan, y si faltan al leer se completan con los valores por defecto en memoria.

```ts
export type MediaSetting = {
  source: "default" | "custom" | "none";
  url: string | null; // solo con source "custom": URL pública en Vercel Blob
};

export type SiteContent = {
  // ...campos de las SPEC 02, 03 y 04
  background: MediaSetting; // "default" = /overcity/paisaje-japon-cyberpunk.webp
  music: MediaSetting; // "default" = /overcity/musica-fondo.mp3
  effectsEnabled: boolean; // true = lluvia, humo, pétalos y relámpagos
};
```

Valores por defecto en `lib/links.ts`:

```ts
background: { source: "default", url: null },
music: { source: "default", url: null },
effectsEnabled: true,
```

Reglas de validación (en `lib/content.ts` y `lib/content-limits.ts`):

- `source` debe ser `default`, `custom` o `none`.
- `url` es obligatoria con `custom` y debe ser `null` con las otras dos.
- Con `custom`, la URL debe ser `https://` de un dominio de Vercel Blob y de hasta 500 caracteres.
- `MAX_BACKGROUND_BYTES = 5 * 1024 * 1024` y `MAX_MUSIC_BYTES = 15 * 1024 * 1024`.
- Tipos permitidos: fondo `image/png`, `image/jpeg`, `image/webp`; música `audio/mpeg`.

Convenciones:

- Los archivos subidos van a Blob con las rutas `background/` y `music/`.
- `app/api/media/route.ts` verifica la cookie `overcity_admin` antes de entregar cualquier token y responde 401 si no hay sesión.
- Quitar o restaurar solo cambia `source`; el borrado del archivo anterior de Blob ocurre al guardar, en `saveContent`.
- Las variables de entorno no cambian.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` las guías de Route Handlers y la documentación de subida desde el cliente de `@vercel/blob/client` (aviso de Next.js 16 del `CLAUDE.md`). Verificación: se sabe qué eventos del token usa la versión instalada.
2. Agregar `MediaSetting`, `background`, `music` y `effectsEnabled` a `lib/content.ts` y `lib/links.ts`, con validación y relleno de valores por defecto al leer `v2` sin esos campos. Verificación: `npm run lint` pasa y `/` se ve igual que antes con contenido guardado sin los campos nuevos.
3. Hacer que `site-view.tsx`, `night-scene.tsx`, `scene-effects.tsx` y `music-toggle.tsx` lean `background`, `music` y `effectsEnabled`, con los activos por defecto. Verificación: forzando valores en `DEFAULT_CONTENT`, se ve fondo liso con `none`, no hay botón `♫` con música `none` y no hay efectos con `effectsEnabled: false`.
4. Crear `app/api/media/route.ts` con `handleUpload`, sesión obligatoria, tipos y tamaños restringidos. Verificación: una petición sin cookie recibe 401 y una con cookie recibe un token para un MP3 y para una imagen válidos.
5. Crear `app/admin/_components/media-uploader.tsx` (cliente) con subir, cambiar, quitar y restaurar, con barra de progreso, error visible y reutilizable para fondo y música. Montarlo en `editor.tsx` junto con el interruptor de efectos. Verificación: se sube un archivo, se ve en `/admin` y se puede quitar y restaurar sin guardar.
6. Hacer que `saveContent` valide los campos nuevos y borre de Blob el archivo anterior cuando cambie `custom`. Verificación: guardar y recargar `/` muestra los cambios, y el archivo viejo desaparece de Blob.
7. Actualizar `CLAUDE.md` con el nuevo modelo, la ruta `app/api/media/route.ts` y los límites. Verificación: el texto coincide con el código.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] Con contenido guardado sin los campos nuevos, `/` se ve igual que tras la SPEC 04 y `/admin` muestra los tres controles en su valor por defecto.
- [ ] Subir un PNG, JPG o WebP de hasta 5 MB como fondo lo muestra en `/admin` y, tras guardar, en `/`.
- [ ] Subir un MP3 de hasta 15 MB (incluido uno de 11 MB, como el de la referencia) reemplaza la música y suena al pulsar `♫ Activar música` en `/`.
- [ ] Un archivo de tipo distinto o que supere el límite se rechaza con mensaje de error, sin guardarse.
- [ ] `Quitar` en el fondo deja el fondo marino `#0A1C29` liso en `/`.
- [ ] `Quitar` en la música oculta el botón `♫` en `/`.
- [ ] `Restaurar` devuelve el paisaje y la música por defecto de `public/overcity/`.
- [ ] Con el interruptor de efectos apagado y guardado, `/` no muestra lluvia, humo, pétalos ni relámpagos.
- [ ] Una petición a `/api/media` sin cookie válida responde 401 y no entrega token.
- [ ] Un guardado con `source: "custom"` y `url` nula, o con `url` que no es de Vercel Blob, se rechaza en el servidor.
- [ ] Al reemplazar o quitar un archivo propio y guardar, el archivo anterior se borra de Blob; los de `public/` no se tocan.
- [ ] Un archivo subido pero no guardado no cambia lo publicado en `/`.
- [ ] `BLOB_READ_WRITE_TOKEN` y los tokens de subida no aparecen en el HTML ni en el JavaScript público.
- [ ] No hay scroll horizontal a 360 px en `/admin` con los tres controles.

## Decisiones

- **Sí:** subida directa a Blob desde el navegador. El MP3 por defecto (11 MB) supera el tope de ~4,5 MB de las funciones de Vercel.
- **No:** subir por el servidor con tope de 4 MB, como el logo. No permitiría reemplazar la música por otra parecida.
- **Sí:** `source: "default" | "custom" | "none"`. Distingue "usar el de la referencia", "usar el mío" y "sin nada", que un simple `null` no puede.
- **Sí:** clave `overcity:content:v2` sin cambios, con relleno de valores por defecto al leer. Solo se agregan campos, no se retiran ni se cambian de forma.
- **Sí:** un único interruptor de efectos. Fue lo elegido; la edición por efecto queda para otro spec.
- **No:** editar el texto del botón de música ni el volumen. No se pidió.
- **Sí:** borrar el archivo anterior de Blob al guardar y no al subir. Subir sin guardar no debe afectar lo publicado.
- **Sí:** los activos por defecto siguen en `public/overcity/` y nunca se borran.
- **Sí:** MP3 como único formato de audio. Es el de la referencia y lo reproducen todos los navegadores.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Alguien sin sesión pide tokens de subida y llena Blob | `/api/media` verifica la cookie firmada antes de generar el token y restringe tipo y tamaño. |
| Se suben archivos que luego no se guardan y quedan huérfanos | Aceptado para un único administrador; al guardar se borra el anterior y los sobrantes se revisan desde Vercel. |
| Una URL manipulada en el guardado apunta a un recurso externo | La validación en servidor exige `https://` de Vercel Blob. |
| El audio de 15 MB consume datos en móvil | `preload="none"` de la SPEC 04: solo se descarga al pulsar el botón. |
| Un fondo muy claro o recargado dificulta leer los textos | Se mantienen los degradados marino de la SPEC 04 sobre cualquier imagen. |
| La subida falla a mitad o se pierde la conexión | El control muestra error y conserva el valor anterior; nada cambia hasta guardar. |
| `onUploadCompleted` de Blob no funciona en local | No se depende de ese evento: el guardado escribe la URL que devuelve la subida. |

## Lo que **no** está en este spec

- Varias pistas, volumen o reproducción automática.
- Edición individual de lluvia, humo, pétalos o relámpagos.
- Fondo en video o por dispositivo.
- Recorte o compresión de archivos.
- Texto editable del botón de música.
- Cambios al logo.

Cada uno, si se hace, va en su propio spec.
