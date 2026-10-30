# SPEC 02 — Panel de administración del contenido de la página de links

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-30
> **Objetivo:** Agregar una ruta `/admin`, protegida por una clave de variable de entorno, que muestra la misma página de links en modo edición para cambiar textos, logo, links y botones, y publica los cambios en la página pública sin redeploy.

## Por qué existe este spec

La SPEC 01 dejó los links como constantes en `lib/links.ts`, por lo que cualquier cambio exige editar código y redesplegar. Este spec mueve el contenido a un almacén de datos en Vercel y da un panel para editarlo. La página ya está publicada en Vercel, por eso se usan servicios de su Marketplace: Upstash Redis para el contenido y Vercel Blob para el logo.

## Alcance

**Dentro:**

- Ruta `/admin` que, sin sesión, muestra un formulario de clave y, con sesión, muestra la página de links en **modo edición**.
- Clave leída de la variable de entorno `ADMIN_PASSWORD`. Quien la escriba correctamente obtiene acceso al panel.
- Sesión por cookie `httpOnly`, `Secure`, `SameSite=Lax`, firmada, con duración de 7 días, firmada con la variable `ADMIN_SESSION_SECRET`. Incluye botón `Cerrar sesión`.
- Límite de intentos fallidos: máximo 5 por IP cada 15 minutos, contado en Redis. Comparación de la clave en tiempo constante.
- Modo edición sobre la misma página: la vista es idéntica a la pública y cada elemento editable tiene un control de edición en línea. Una barra superior fija tiene `Guardar`, `Descartar cambios` y `Cerrar sesión`.
- Contenido editable:
  - Texto de cabecera (`OverCity`) y subtítulo (`Streetwear`).
  - Título de sección (`😈 Overcity Premium 😈`).
  - Botones: texto y link de cada uno.
  - Agregar, quitar y reordenar botones.
  - Link de Instagram.
  - Logo: subir, cambiar y quitar (PNG, JPG o WebP, máximo 2 MB), guardado en Vercel Blob. Sin logo, la cabecera queda como hoy.
- La página pública `/` lee el contenido de Redis, se mantiene en caché y se invalida al guardar, para que el cambio se vea al recargar.
- Respaldo: si Redis está vacío o falla, `/` muestra los valores por defecto de `lib/links.ts`. Esos valores son también el contenido inicial.
- Validación en servidor de todo lo que se guarda: tipos, longitudes y URLs `http(s)`.
- `/admin` no se indexa (`noindex`) y no aparece enlazada desde la página pública.
- **Regla para el futuro:** todo contenido nuevo que se agregue a la página pública y que razonablemente cambie con el tiempo (textos, links, imágenes) debe nacer en el modelo de contenido y ser editable desde el panel. Elementos fijos de estructura (iconos de compartir, estilos) no lo requieren.

**Fuera de alcance (specs futuros):**

- Múltiples usuarios, roles o claves distintas.
- Editar la paleta, tipografías o estilos desde el panel.
- Editar las redes del modal de compartir.
- Más redes sociales además de Instagram.
- Historial de versiones o deshacer cambios ya publicados.
- Vista previa en borrador sin publicar (los cambios se publican al pulsar `Guardar`).
- Analítica de clics y miniaturas en los botones.
- Imagen Open Graph propia.
- Subida de más imágenes que el logo.

## Modelo de datos

Contenido en una única clave de Redis, `overcity:content:v1`, guardada como JSON:

```ts
export type LinkItem = {
  id: string; // uuid generado al crear el botón
  label: string; // texto visible, incluye el emoji
  href: string; // URL http(s)
};

export type SiteContent = {
  brandName: string; // "OverCity"
  tagline: string; // "Streetwear"
  sectionTitle: string; // "😈 Overcity Premium 😈"
  logoUrl: string | null; // URL pública en Vercel Blob; null = sin logo
  instagramUrl: string;
  links: LinkItem[]; // el orden del arreglo es el orden en pantalla
};
```

Valores por defecto: `DEFAULT_CONTENT: SiteContent` en `lib/links.ts` (reemplaza `INSTAGRAM_URL` y `CATALOG_LINKS`), con los mismos textos y URLs de la SPEC 01 y `logoUrl: null`.

Límites de validación: `brandName`, `tagline` y `sectionTitle` hasta 60 caracteres; `label` hasta 40; máximo 20 botones; `href` e `instagramUrl` con protocolo `http` o `https` y hasta 500 caracteres.

Otras claves de Redis:

- `overcity:ratelimit:login:<ip>` — contador de intentos fallidos con TTL de 15 minutos.

Variables de entorno (también en `.env.local` para desarrollo):

- `ADMIN_PASSWORD` — clave de acceso al panel.
- `ADMIN_SESSION_SECRET` — secreto para firmar la cookie de sesión.
- `KV_REST_API_URL` y `KV_REST_API_TOKEN` — las crea la integración de Upstash Redis.
- `BLOB_READ_WRITE_TOKEN` — lo crea la integración de Vercel Blob.

Convenciones:

- La cookie de sesión se llama `overcity_admin` y contiene la expiración firmada con HMAC-SHA256.
- Toda escritura (guardar contenido, subir logo) pasa por Server Actions o Route Handlers que verifican la sesión antes de actuar.
- La página pública solo lee; nunca expone `ADMIN_PASSWORD` ni tokens.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` las guías de `cacheComponents`, `"use cache"`, `cacheTag`/`revalidateTag`, cookies, Server Actions y Route Handlers (aviso de Next.js 16 del `CLAUDE.md`). Instalar `@upstash/redis` y `@vercel/blob`. Verificación: `npm run build` pasa.
2. Crear `lib/content.ts` con los tipos `SiteContent` y `LinkItem`, la validación y `getContent()` con respaldo a `DEFAULT_CONTENT`; mover los valores por defecto desde `lib/links.ts`. Verificación: `npm run lint` pasa.
3. Hacer que `app/page.tsx` lea `getContent()` en caché con etiqueta `content`, con el mismo resultado visual que hoy. Verificación: `/` se ve igual con Redis sin configurar.
4. Crear `lib/auth.ts`: firmar y verificar la cookie `overcity_admin`, comparar la clave en tiempo constante y limitar intentos con Redis. Verificación: pruebas manuales con claves buenas, malas y 6 intentos fallidos.
5. Crear `app/admin/page.tsx` con el formulario de clave y la Server Action de entrada y salida, con `noindex`. Verificación: sin sesión pide clave; con la correcta muestra un marcador de panel.
6. Extraer la vista de la página a un componente compartido y crear `app/admin/_components/editor.tsx` (cliente) que la muestra en modo edición con la barra superior. Edición de textos y links de botones, estado local y `Descartar cambios`. Verificación: se edita en pantalla sin guardar.
7. Agregar quitar, agregar y reordenar botones en el editor. Verificación: el orden y la lista cambian en pantalla.
8. Crear la Server Action `saveContent` (verifica sesión, valida, escribe en Redis, llama a `updateTag("content")`). Verificación: guardar y recargar `/` muestra el cambio.
9. Crear la subida de logo (Route Handler o Server Action con `@vercel/blob`) con control de tipo y tamaño, y la opción de quitarlo. Verificación: el logo aparece en `/admin` y en `/`; sin logo la cabecera queda como hoy.
10. Documentar las variables de entorno en `CLAUDE.md` y crear `.env.example` sin valores reales. Verificación: `.env.local` no está versionado.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] Entrar a `/admin` sin sesión muestra solo el formulario de clave.
- [ ] Una clave incorrecta muestra un error y no concede acceso.
- [ ] La clave igual a `ADMIN_PASSWORD` concede acceso y deja la cookie `overcity_admin` con `HttpOnly`, `Secure` (en producción) y duración de 7 días.
- [ ] Tras 5 intentos fallidos desde la misma IP, el sexto se rechaza aunque la clave sea correcta, durante 15 minutos.
- [ ] `Cerrar sesión` borra la cookie y `/admin` vuelve a pedir la clave.
- [ ] La vista de `/admin` con sesión coincide visualmente con `/`, más los controles de edición y la barra superior.
- [ ] Se pueden editar `brandName`, `tagline`, `sectionTitle`, `instagramUrl`, y el texto y el link de cada botón.
- [ ] Se puede agregar un botón, quitar un botón y cambiar su orden, y el orden guardado es el que se ve en `/`.
- [ ] `Guardar` publica los cambios y al recargar `/` se ven, sin redeploy.
- [ ] `Descartar cambios` restaura el último contenido guardado.
- [ ] Un link que no empieza por `http://` o `https://` se rechaza con mensaje de error y no se guarda.
- [ ] Un texto que supera su límite de caracteres se rechaza con mensaje de error y no se guarda.
- [ ] Subir un PNG, JPG o WebP de hasta 2 MB muestra el logo en `/admin` y en `/`.
- [ ] Subir un archivo de otro tipo o de más de 2 MB se rechaza con mensaje de error.
- [ ] `Quitar logo` hace que la cabecera vuelva a ser solo texto, igual que en la SPEC 01.
- [ ] Una petición de guardado o subida sin cookie válida responde 401 o equivalente y no escribe nada.
- [ ] Con Redis sin configurar o caído, `/` muestra los valores por defecto de `lib/links.ts` sin error.
- [ ] `/admin` responde con `noindex` y no hay ningún enlace a `/admin` en la página pública.
- [ ] `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` y los tokens no aparecen en el HTML ni en el JavaScript enviado al navegador.
- [ ] No hay scroll horizontal a 360 px en `/admin` ni en `/`.

## Decisiones

- **Sí:** Upstash Redis (Marketplace de Vercel) para el contenido. La página ya está en Vercel, el plan gratis alcanza y el contenido es un único JSON pequeño.
- **No:** guardar en archivos del repositorio o disco. En Vercel el sistema de archivos es de solo lectura y exigiría redeploy.
- **No:** Supabase o base de datos relacional. Es excesivo para un único documento.
- **Sí:** Vercel Blob para el logo. Es la opción nativa de Vercel y entrega URL pública.
- **Sí:** modo edición sobre la misma página, no un formulario aparte. Fue la preferencia explícita del usuario: ver la página tal como queda mientras se edita.
- **Sí:** un solo documento JSON con clave versionada (`overcity:content:v1`). Permite migrar el esquema después sin romper.
- **Sí:** `lib/links.ts` queda como contenido inicial y respaldo. La página nunca queda vacía si falla Redis.
- **Sí:** publicación inmediata con `updateTag` (en lugar de `revalidateTag`, que no garantiza ver el cambio al instante). La página pública sigue en caché y rápida, y el cambio se ve al guardar.
- **No:** vista previa en borrador. Guardar publica directamente; se puede corregir en segundos desde el mismo panel.
- **Sí:** cookie de 7 días, firmada y `httpOnly`. Evita pedir la clave en cada visita sin dejar la sesión abierta indefinidamente.
- **Sí:** límite de 5 intentos por IP cada 15 minutos. Una clave única en una ruta pública es vulnerable a fuerza bruta y Redis ya está disponible.
- **No:** NextAuth u otro proveedor de autenticación. Hay una sola clave y un solo usuario.
- **Sí:** regla de que el contenido futuro nazca editable. Fue petición explícita del usuario; se limita a lo que realmente cambia, no a la estructura ni los estilos.
- **No:** editar las redes del modal de compartir ni la paleta desde el panel. Cambian rara vez y pueden ir a otra spec.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Fuerza bruta contra `/admin` | Límite de 5 intentos por IP cada 15 min, clave larga recomendada y comparación en tiempo constante. |
| Detrás del proxy de Vercel la IP no es la del cliente | Leer la IP de `x-forwarded-for` (primer valor); si falta, usar un contador global conservador. |
| Redis caído al guardar | La acción devuelve error visible, no pierde lo editado y el contenido publicado no cambia. |
| Redis caído al leer la página pública | Se usan los valores de `lib/links.ts`. |
| Una imagen de logo grande o con formato inesperado | Validación de tipo MIME y de 2 MB en servidor, no solo en el cliente. |
| Un `href` con `javascript:` u otro protocolo | Validación en servidor que acepta solo `http` y `https`. |
| `cacheComponents` cambia el modelo de renderizado | La página pública usa `"use cache"` con `cacheTag("content")`; `/admin` es dinámica porque lee cookies. Se consultan las guías de Next.js 16 antes de escribir código. |
| Logo antiguo queda huérfano en Blob al reemplazarlo | Al subir un logo nuevo o quitarlo se borra el anterior de Blob. |
| Dos pestañas del admin guardan a la vez | Gana la última escritura; aceptado para un único administrador. |

## Lo que **no** está en este spec

- Múltiples usuarios, roles o claves.
- Editar paleta, tipografías o el modal de compartir.
- Redes sociales adicionales.
- Borradores, vista previa o historial de versiones.
- Más imágenes que el logo.
- Analítica, miniaturas en botones e imagen Open Graph propia.

Cada uno, si se hace, va en su propio spec.
