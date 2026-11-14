# SPEC 06 — Catálogo de productos editable desde el panel

> **Estado:** Aprobado
> **Depende de:** SPEC 02, SPEC 04, SPEC 05
> **Fecha:** 2026-11-10
> **Objetivo:** Mostrar un catálogo público de productos (`/catalogo` y `/catalogo/[id]`) con categorías, imágenes, precio y botón de compra, que se administra completo desde `/admin/catalogo` con imágenes en Vercel Blob y topes de cantidad y tamaño.

## Por qué existe este spec

La página de OverCity hoy solo tiene links y redes. El usuario quiere vender productos y editar su catálogo desde el panel, con las imágenes limitadas para que nada pese de más. La alternativa de subir las imágenes a una carpeta del proyecto no funciona en producción: en Vercel el disco es de solo lectura, así que el panel no podría escribir archivos nuevos, y solo se añadirían con un commit y un deploy. Cloudinary sí funcionaría, pero obliga a una cuenta, claves y una dependencia nuevas. Vercel Blob ya está integrado desde las SPEC 02 y 05, con subida directa del navegador y sesión de admin, y el límite se aplica con topes en el código. Las imágenes viven fuera del repositorio, así que el proyecto no crece.

## Alcance

**Dentro:**

- Un único catálogo con **categorías** editables y **productos**.
- Datos del catálogo editables: título (por defecto `Catálogo`) y moneda (por defecto `COP`).
- Cada producto tiene nombre, de 1 a 4 imágenes, descripción opcional, precio opcional (número entero en la moneda del catálogo), URL de compra opcional, categoría opcional e interruptor Visible/Oculto.
- En `/admin/catalogo` (nueva ruta, mismo `overcity_admin` y misma estética):
  - Editar título y moneda.
  - Agregar, renombrar, reordenar (`←` `→`) y quitar categorías.
  - Agregar, editar, reordenar (`←` `→`), ocultar y quitar productos.
  - Subir, quitar y reordenar las imágenes de cada producto; la primera es la portada.
  - Un único botón `Guardar`: lo subido o cambiado no se publica hasta guardar.
  - Enlace a `/admin/catalogo` desde la barra de edición de `/admin`.
- Página pública `/catalogo`: título, productos visibles agrupados por categoría en rejilla de 2 columnas.
- Página pública `/catalogo/[id]`: galería de imágenes, nombre, precio, descripción y botón de compra. Un producto oculto o inexistente responde 404.
- Botón `Ver catálogo` (catálogo completo) dentro de la lista de botones de la home (`/`), como un botón más con el mismo estilo de píldora y trazo de neón de la SPEC 04, en primer lugar, con el título del catálogo como texto. Enlaza a `/catalogo` en la misma pestaña y solo se muestra si hay al menos un producto visible. Es automático: no es un `LinkItem` editable ni cuenta para el tope de 20 links.
- Topes: 40 productos, 10 categorías, 4 imágenes por producto, 2 MB por imagen (PNG, JPG o WebP). Máximo teórico: 160 imágenes, unos 320 MB.
- Subida directa del navegador a Vercel Blob con la ruta `app/api/media/route.ts` existente, ampliada con el prefijo `catalog/`.
- Al guardar, se borran de Blob las imágenes que ya no se usan, incluidas las de productos quitados.
- Validación en servidor de todo el catálogo, con mensajes de error visibles en el panel.
- Actualizar `CLAUDE.md` con el modelo, la clave de Redis, las rutas y los límites.

**Fuera de alcance (specs futuros):**

- Carrito, pagos, pedidos, stock o inventario.
- Variantes (tallas, colores) y varios precios por producto.
- Varios catálogos independientes.
- Buscador, filtros, ordenar por precio o paginación.
- Compresión, recorte o redimensionado de imágenes (se rechazan las que pasen de 2 MB).
- Imagen de portada propia por categoría.
- Metadatos para compartir (Open Graph) y SEO específico por producto.
- Arrastrar y soltar para reordenar.
- Analítica de visitas o clics de compra.
- Cambiar el modal de compartir de la SPEC 01.
- Botones de categorías individuales en la home (por ejemplo `Camisetas`, `Gorras`), solos o junto al del catálogo completo. Se analiza en otro spec; por ahora la home solo tiene el botón del catálogo completo.

## Modelo de datos

El catálogo vive aparte de `SiteContent`, con su propia clave de Redis y etiqueta de caché, para no reescribir el contenido de la página cada vez que se edita un producto. Tipos y validación en `lib/catalog.ts`.

```ts
export type CatalogCategory = {
  id: string; // uuid generado al agregar
  name: string; // hasta 40 caracteres
};

export type CatalogProduct = {
  id: string; // uuid; es el id de /catalogo/[id]
  name: string; // 1 a 60 caracteres
  description: string; // hasta 500 caracteres; "" si no hay
  price: number | null; // entero >= 0 en la moneda del catálogo; null = sin precio
  buyUrl: string | null; // http(s), hasta 500 caracteres; null = sin botón de compra
  images: string[]; // 1 a 4 URLs de Vercel Blob; images[0] es la portada
  categoryId: string | null; // null = sin categoría
  visible: boolean; // false = no sale en el sitio público
};

export type Catalog = {
  title: string; // hasta 60 caracteres, por defecto "Catálogo"
  currency: CatalogCurrency; // por defecto "COP"
  categories: CatalogCategory[]; // el orden del arreglo es el orden en pantalla
  products: CatalogProduct[]; // el orden del arreglo es el orden en pantalla
};

export const CATALOG_CURRENCIES = ["COP", "USD", "EUR", "MXN", "ARS", "PEN", "CLP", "BRL"] as const;
export type CatalogCurrency = (typeof CATALOG_CURRENCIES)[number];
```

Valor por defecto (en `lib/catalog.ts`): `{ title: "Catálogo", currency: "COP", categories: [], products: [] }`.

Límites (en `lib/content-limits.ts`, junto a los de las SPEC 02 y 05):

```ts
export const MAX_PRODUCTS = 40;
export const MAX_CATEGORIES = 10;
export const MAX_PRODUCT_IMAGES = 4;
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PRODUCT_NAME = 60;
export const MAX_PRODUCT_DESCRIPTION = 500;
export const MAX_PRICE = 999_999_999;
export const PRODUCT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
```

Reglas de validación en servidor:

- `currency` debe estar en `CATALOG_CURRENCIES`.
- `price` es entero entre 0 y `MAX_PRICE`, o `null`.
- `buyUrl` es `null` o una URL `http://` o `https://` de hasta `MAX_URL` caracteres.
- Cada URL de `images` debe ser `https://` de un dominio de Vercel Blob (misma regla de la SPEC 05) y de hasta `MAX_URL` caracteres.
- `categoryId` debe ser `null` o el id de una categoría existente.
- Los `id` de categorías y productos son únicos.
- Un guardado que supere cualquier tope se rechaza completo.

Persistencia y convenciones:

- Clave Redis `overcity:catalog:v1`. Si no existe o falla la lectura, se usa el valor por defecto.
- Lectura pública con `"use cache"` y etiqueta `catalog`; `saveCatalog` llama a `updateTag("catalog")`. `getPublicCatalog()` entrega solo productos visibles; el panel lee todos.
- Formato de precio: `Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 })`; por ejemplo `$ 85.000` para COP. Sin precio no se muestra nada.
- Las imágenes van a Blob con ruta `catalog/<nombre>` y sufijo aleatorio, como las SPEC 05.
- Las variables de entorno no cambian.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` las guías de rutas dinámicas con `cacheComponents` (parámetros dinámicos en `/catalogo/[id]`, `"use cache"`, `notFound`) y de imágenes remotas (aviso de Next.js 16 del `CLAUDE.md`). Revisar cómo se muestra hoy el logo de Blob para seguir el mismo patrón. Verificación: se sabe cómo renderizar `[id]` sin romper el build y cómo mostrar imágenes de Blob.
2. Agregar los límites del catálogo a `lib/content-limits.ts` y crear `lib/catalog.ts` con tipos, valor por defecto, validación, lectura/escritura en `overcity:catalog:v1` y `getPublicCatalog()`. Verificación: `npm run lint` pasa y nada visible cambia.
3. Ampliar `app/api/media/route.ts` con el prefijo `catalog/` (`PRODUCT_IMAGE_TYPES`, `MAX_PRODUCT_IMAGE_BYTES`). Verificación: sin cookie sigue respondiendo 401; con cookie entrega token para una imagen en `catalog/` y rechaza otras rutas.
4. Crear `app/admin/catalogo/actions.ts` con `saveCatalog` (sesión obligatoria, validación, escritura, `updateTag("catalog")` y borrado en Blob de las imágenes que ya no se usan). Verificación: guardar un catálogo de prueba lo escribe en Redis y borra de Blob las imágenes retiradas; uno inválido se rechaza con mensaje.
5. Crear `app/admin/catalogo/page.tsx` y `app/admin/catalogo/_components/catalog-editor.tsx` con título, moneda y categorías, sin productos todavía, y el enlace desde la barra de `/admin`. Verificación: se edita título, moneda y categorías, se guardan y se recargan; sin sesión pide la contraseña.
6. Agregar al editor los productos: lista, campos, interruptor Visible/Oculto, `←` `→` y `Quitar`, y `app/admin/catalogo/_components/product-images.tsx` (cliente) para subir, quitar y reordenar imágenes con progreso y error visible. Verificación: se crea un producto con 4 imágenes, se reordena, se oculta y se guarda; la quinta imagen y una de más de 2 MB se rechazan.
7. Crear `app/catalogo/page.tsx` (rejilla por categoría) y `app/catalogo/[id]/page.tsx` (detalle con galería y botón de compra), con la estética de la SPEC 04 y `notFound()` para productos ocultos o inexistentes. Verificación: lo guardado en el panel se ve en ambas rutas y un producto oculto da 404.
8. Agregar en `app/_components/site-view.tsx` el botón `Ver catálogo` como primer elemento de la lista de botones, con el mismo componente y estilo de los links, hacia `/catalogo`, solo si hay productos visibles. Verificación: aparece primero en la lista con un producto visible, se ve igual que los demás botones y desaparece al ocultarlos todos.
9. Actualizar `CLAUDE.md` con el modelo, la clave `overcity:catalog:v1`, las rutas y los límites. Verificación: el texto coincide con el código.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] Sin catálogo guardado, `/` se ve igual que antes (sin botón `Ver catálogo`), `/catalogo` no muestra productos y `/admin/catalogo` abre con título `Catálogo` y moneda `COP`.
- [ ] `/admin/catalogo` sin sesión muestra el formulario de contraseña y no entrega datos del catálogo.
- [ ] Se puede crear una categoría, un producto en ella y uno sin categoría; tras guardar aparecen en `/catalogo` agrupados y en el orden del panel.
- [ ] Un producto con 4 imágenes se guarda; subir una quinta se rechaza con mensaje.
- [ ] Una imagen de más de 2 MB o de un tipo que no sea PNG, JPG o WebP se rechaza con mensaje y no se guarda.
- [ ] Con 40 productos, `Agregar producto` queda deshabilitado, y un guardado con 41 enviado al servidor se rechaza.
- [ ] Con 10 categorías, `Agregar categoría` queda deshabilitado, y un guardado con 11 se rechaza.
- [ ] La primera imagen del producto es la portada en `/catalogo` y reordenar las imágenes cambia la portada tras guardar.
- [ ] El precio `85000` con moneda `COP` se muestra con formato de pesos sin decimales; cambiar la moneda y guardar actualiza el formato en todo el catálogo.
- [ ] Un producto sin precio no muestra precio; uno sin `buyUrl` no muestra botón de compra.
- [ ] El botón de compra abre `buyUrl` en pestaña nueva con `rel="noopener noreferrer"`.
- [ ] Un producto con interruptor en `Oculto` no aparece en `/catalogo` y `/catalogo/[id]` responde 404; al volver a `Visible` y guardar, reaparece.
- [ ] `/catalogo/[id]` con un id inexistente responde 404.
- [ ] Quitar una categoría deja sus productos como `Sin categoría`, sin borrarlos.
- [ ] Al quitar un producto o reemplazar una imagen y guardar, los archivos retirados se borran de Blob; los que siguen en uso no se tocan.
- [ ] Imágenes subidas pero no guardadas no cambian lo publicado.
- [ ] Un guardado con `currency` fuera de la lista, `price` negativo o decimal, `buyUrl` sin `http(s)://`, imagen que no es de Vercel Blob o `categoryId` inexistente se rechaza en el servidor.
- [ ] Una petición a `/api/media` sin cookie válida responde 401 y no entrega token; una ruta fuera de `background/`, `music/` y `catalog/` se rechaza.
- [ ] `BLOB_READ_WRITE_TOKEN` y los tokens de subida no aparecen en el HTML ni en el JavaScript público.
- [ ] El botón `Ver catálogo` aparece en `/` solo con al menos un producto visible.
- [ ] El botón `Ver catálogo` es el primero de la lista de botones de `/`, tiene el mismo estilo que los demás (píldora, neón, elevación al pasar el cursor) y lleva a `/catalogo` en la misma pestaña.
- [ ] En `/` no hay botones de categorías individuales.
- [ ] El botón `Ver catálogo` no se lista en el editor de links de `/admin` ni cuenta para el tope de 20 links.
- [ ] Todo control de icono del catálogo tiene `aria-label`, las imágenes tienen `alt` con el nombre del producto y todo se alcanza con Tab.
- [ ] No hay scroll horizontal a 360 px en `/catalogo`, `/catalogo/[id]` ni `/admin/catalogo` con 40 productos.

## Decisiones

- **Sí:** Vercel Blob para las imágenes. Ya está integrado, comparte el patrón de subida con sesión de las SPEC 02 y 05 y no añade cuentas ni dependencias.
- **No:** carpeta del proyecto. En Vercel el disco es de solo lectura: el panel no podría subir imágenes en producción y habría que hacer commit y deploy por cada foto.
- **No:** Cloudinary. Optimiza imágenes al vuelo, pero exige cuenta, claves y dependencia nuevas, y los topes de 40 × 4 × 2 MB no lo justifican. Se reevalúa en otro spec si el catálogo crece.
- **Sí:** topes de 40 productos, 4 imágenes y 2 MB. Máximo de unos 320 MB en Blob, que mantiene el costo bajo y obliga a subir fotos ya comprimidas.
- **Sí:** un único catálogo con categorías. Fue lo elegido; varios catálogos independientes quedan para otro spec.
- **Sí:** el catálogo en una clave propia (`overcity:catalog:v1`) y etiqueta de caché `catalog`. Editar productos no reescribe `SiteContent` ni invalida la caché de la página de links.
- **Sí:** subida directa a Blob ampliando `/api/media`. Reutiliza la verificación de sesión y la restricción por prefijo ya probadas.
- **Sí:** precio entero con moneda del catálogo editable, `COP` por defecto. Permite formato consistente sin decimales; la lista de monedas es fija para validar en servidor.
- **No:** precio por producto en distinta moneda. Una sola moneda por catálogo evita mezclar valores.
- **Sí:** `buyUrl` propia por producto, igual que las URL de las redes de la SPEC 03. Sirve para WhatsApp (`https://wa.me/...`) o cualquier tienda sin lógica extra.
- **Sí:** interruptor Visible/Oculto en vez de solo borrar. Permite retirar un producto temporalmente conservando datos e imágenes.
- **Sí:** página de detalle `/catalogo/[id]`, con el uuid del producto como id. Permite compartir un producto concreto sin añadir un campo `slug` que mantener.
- **Sí:** el borrado de imágenes de Blob ocurre al guardar y no al subir o quitar. Subir sin guardar no debe afectar lo publicado, igual que en la SPEC 05.
- **Sí:** categorías agrupadas en secciones, sin filtros con JavaScript. Mantiene la vista pública ligera y sin estado en el cliente.
- **Sí:** el botón del catálogo completo vive en la lista de botones de la home, automático y en primer lugar. Fue lo pedido; así el catálogo es lo primero que ve el visitante y no depende de que alguien agregue un link a mano.
- **No:** botones de categorías en la home por ahora. Se pidió dejarlo solo con el catálogo completo y analizar después si se suman categorías.
- **No:** hacer el botón un `LinkItem` editable. Las URL de los links son externas (`http(s)`) y el botón debe apuntar a `/catalogo` y ocultarse solo cuando no haya productos visibles.
- **Sí:** rejilla de 2 columnas dentro de la columna `max-w-md` de la SPEC 04. Respeta el layout oficial móvil primero.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Alguien sin sesión pide tokens para llenar Blob con imágenes | `/api/media` verifica la cookie firmada antes de generar el token y restringe tipo, tamaño y prefijo. |
| Se suben imágenes que luego no se guardan y quedan huérfanas | Aceptado para un único administrador; el tope de 2 MB acota el costo y los sobrantes se revisan desde Vercel. |
| El guardado falla a mitad y deja imágenes borradas pero el catálogo sin actualizar | Primero se escribe el catálogo en Redis y después se borran los archivos sobrantes; un fallo al borrar deja huérfanos, no enlaces rotos. |
| Dos pestañas del panel guardan a la vez y una pisa a la otra | Aceptado para un único administrador; el último guardado gana. |
| Una `buyUrl` con `javascript:` o `data:` | La validación en servidor exige `http://` o `https://`. |
| Una URL de imagen manipulada apunta a un recurso externo | La validación en servidor exige `https://` de un dominio de Vercel Blob. |
| `/catalogo/[id]` rompe el build con `cacheComponents` | Se leen primero las guías de Next.js 16 (paso 1) y se verifica con `npm run build`. |
| Rejilla con nombres o precios largos desborda a 360 px | Texto con `truncate` o salto de línea y comprobación en los criterios de aceptación. |
| Una moneda con formato `es-CO` se ve rara (por ejemplo USD) | Aceptado: se muestra el código de la moneda; el formato de miles se conserva. |

## Lo que **no** está en este spec

- Carrito, pagos, pedidos o stock.
- Variantes de producto o varios precios.
- Varios catálogos independientes.
- Buscador, filtros, orden por precio o paginación.
- Compresión o recorte de imágenes.
- Portada propia por categoría.
- Botones de categorías en la home.
- Open Graph o SEO por producto.
- Arrastrar y soltar y analítica de clics.

Cada uno, si se hace, va en su propio spec.
