# SPEC 07 — Tienda pública y panel de catálogo según el diseño de Claude Design

> **Estado:** Aprobado
> **Depende de:** SPEC 02, SPEC 04, SPEC 05, SPEC 06
> **Fecha:** 2026-11-14
> **Objetivo:** Reemplazar las pantallas de catálogo de la SPEC 06 por las del diseño `references/pages/OverCity Tienda.html` (tienda ancha con buscador, orden, colores, tallas y stock, y panel de productos y categorías), con productos que pasan a tener colores, tallas con stock y hasta 8 fotos con color.

> **Ampliación (2026-11-14, pedida por el usuario tras revisar la implementación):** `/admin` pasa a ser el único panel, con la barra lateral del diseño. Se elimina el editor "Modo edición" de la SPEC 02 (la página de links editada sobre la propia página). La página de links se administra ahora desde `/admin` con un formulario (logo, textos, botones, redes, fondo, música y efectos) y el catálogo desde `/admin/catalogo`. Cambia `app/admin/layout.tsx` (sesión y barra lateral compartidas), `app/admin/page.tsx` y `app/admin/_components/links-admin.tsx`; se borra `editor.tsx` y `SiteView` pierde el modo edición y los slots.

## Por qué existe este spec

El usuario armó con Claude Design el diseño completo de la tienda (`references/pages/OverCity Tienda.html`) y pidió adaptarlo al proyecto tal como está hoy. El diseño es una tienda entera: tienda pública, bolsa y checkout, y panel con productos, categorías y pedidos. Eso no cabe en un solo spec, así que se parte: este spec cubre **la tienda pública (sin compra) y el panel de productos y categorías**. La bolsa, el checkout y los pedidos quedan para specs siguientes; la idea del usuario es que la gente elija varios productos en la bolsa y desde ahí pase a WhatsApp.

El diseño exige datos que la SPEC 06 no tiene (colores, tallas, stock por talla, color por foto, categorías de talla única) y cambia reglas de la SPEC 06 (8 fotos en vez de 4, arrastrar y soltar, buscador y orden, botones de categoría en la home, layout ancho). Por eso el catálogo pasa a `v2` y este spec reemplaza esas partes de la SPEC 06.

El archivo de referencia es un bundle: el diseño real está en su plantilla (HTML con estilos en línea y un script de datos de ejemplo). Es referencia visual y de comportamiento; no se copia su runtime. Se reimplementa con componentes de Next.js y Tailwind siguiendo la SPEC 04.

## Alcance

**Dentro:**

- **Modelo `v2` del catálogo** (clave `overcity:catalog:v2`) con colores de una paleta fija, tallas con stock por talla, categorías con interruptor de talla única, hasta 8 imágenes por producto con color por imagen. Sin `buyUrl`.
- **Encabezado de tienda** fijo (logo y nombre de la marca de `SiteContent`, navegación `Inicio` / `Catálogo`) en `/catalogo` y `/catalogo/[id]`. Sin candado de admin y sin bolsa.
- **`/catalogo`** (ancho, responsive hasta 1240 px):
  - Título con las máscaras oni, buscador sin tildes (nombre y categoría) y orden (`Destacados` = orden del panel, `Precio: menor`, `Precio: mayor`).
  - Chips `Todos` + categorías con al menos un producto visible, con contador. Admite `?categoria=<id>`.
  - Tarjetas 4:5 con portada, nombre, precio, puntos de color, contador de fotos, insignia `AGOTADO` y cambio a la segunda foto al pasar el cursor.
  - Contador de resultados y estado vacío con `Limpiar filtros`.
- **`/catalogo/[id]`** (ancho): ruta de migas (`← Catálogo / categoría`), galería de las fotos del color elegido (anterior/siguiente, contador, miniaturas), selector de color, selector de talla (tachada si no hay stock) con mensaje (`Elige tu talla`, `¡Quedan N!` con 3 o menos, `Disponible`, `Agotado`), nombre, precio y descripción. Sin cantidad, sin bolsa y sin botón de compra. Un producto oculto o inexistente responde 404 (misma regla de la SPEC 06).
- **Home `/`:** debajo del botón `Ver catálogo`, un botón por categoría con al menos un producto visible: miniatura de la portada del primer producto visible, nombre y contador; lleva a `/catalogo?categoria=<id>`. Automáticos: no son `LinkItem` ni cuentan para el tope de 20 links.
- **Panel `/admin/catalogo`** con la estética del diseño: barra lateral en escritorio y barra superior en móvil, con `Productos`, `Categorías` y `Ajustes`, enlace `Ver tienda` y enlace de vuelta a `/admin`:
  - **Productos:** lista con buscador y chips de categoría, miniatura, nombre, precio, stock total (`Agotado` en rojo), minifotos con contador, interruptor Visible (se guarda al momento), flechas para reordenar y `Editar`. Botón `Nuevo producto`. Contador `N productos · M visibles`.
  - **Ficha de producto** (`/admin/catalogo/producto/[id]`, `nuevo` para crear), con barra fija (volver, nombre, estado `Cambios sin guardar` / `Todo guardado`, `Ver en tienda`, `Descartar`, `Guardar`). **Guardado por ficha:** nada se publica hasta `Guardar`.
    - **Imágenes (hasta 8, 2 MB c/u, PNG/JPG/WebP):** subir con selector o arrastrando archivos, progreso por foto, errores visibles, reordenar arrastrando (escritorio) y con flechas `←` `→` (todos los dispositivos), la primera es la portada, color por foto, filtro por color, modo selección para eliminar o asignar color en lote, `Deshacer` al eliminar.
    - **Información:** nombre, precio (entero o vacío) con vista previa del formato, categoría con `+ Crear categoría…` en línea, descripción e interruptor Visible.
    - **Colores:** botones de la paleta fija (al menos uno). Quitar un color pasa sus fotos al primer color restante.
    - **Stock por talla:** una celda por talla (`XS` a `XL`, o `Única` si la categoría es de talla única). Las tallas en 0 salen tachadas en la tienda.
  - **Categorías:** crear, renombrar en el sitio, reordenar (`↑` `↓`), interruptor `Talla única`, enlace `N productos →` a la lista filtrada y eliminar con confirmación en `<dialog>`. Se guardan al momento. Eliminar deja sus productos sin categoría.
  - **Ajustes:** título del catálogo y moneda (lo que hoy editan título y moneda en la SPEC 06).
- Migración en memoria de `overcity:catalog:v1` a `v2` (sin tocar `v1`).
- Validación en servidor de todo lo nuevo, con mensajes visibles.
- Actualizar `CLAUDE.md` (modelo, clave, rutas, límites y la regla de layout de la tienda).

**Fuera de alcance (specs futuros):**

- Bolsa, checkout, confirmación de pedido, panel de pedidos, estados de pedido y descuento de stock.
- Botón de compra, `Preguntar por WhatsApp` y selector de cantidad en el detalle. El flujo de WhatsApp se define con la bolsa.
- Marca `Nuevo`: insignia, chip `Nuevos`, sección `Lo nuevo` de la home y orden `Nuevos primero`.
- Tarjetas de envíos y cambios del detalle.
- Candado de admin en el encabezado (quien tiene sesión ya llega por `/admin`).
- Visor `Ajustar foto` con zoom y encuadre por imagen.
- Botón de música en las páginas de tienda.
- Varios catálogos, tallas personalizadas, colores personalizados, varios precios por producto, paginación.
- Deshacer en categorías y en eliminación de productos (se usa confirmación).
- Open Graph y SEO por producto.

## Modelo de datos

Tipos y constantes compartidas en `lib/catalog-shared.ts` (aptas para el cliente); validación, migración y Redis en `lib/catalog.ts`.

```ts
export const CATALOG_COLORS = ["Negro", "Blanco", "Rojo", "Navy", "Gris", "Arena"] as const;
export type CatalogColor = (typeof CATALOG_COLORS)[number];
export const CATALOG_COLOR_HEX: Record<CatalogColor, string> = {
  Negro: "#141414",
  Blanco: "#e6e6e6",
  Rojo: "#d81a21",
  Navy: "#1b4263",
  Gris: "#6b7178",
  Arena: "#b8a684",
};

export const CATALOG_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export const ONE_SIZE = "Única";

export type CatalogCategory = {
  id: string; // uuid generado al crear
  name: string; // 1 a 40 caracteres, único sin distinguir mayúsculas ni tildes
  oneSize: boolean; // true = sus productos solo tienen la talla "Única"
};

export type CatalogImage = {
  url: string; // URL de Vercel Blob
  color: CatalogColor; // debe estar en product.colors
};

export type CatalogProduct = {
  id: string; // uuid; es el id de /catalogo/[id]
  name: string; // 1 a 60 caracteres
  description: string; // hasta 500 caracteres; "" si no hay
  price: number | null; // entero 0..MAX_PRICE; null = sin precio
  categoryId: string | null; // null = sin categoría
  visible: boolean;
  colors: CatalogColor[]; // 1 a 6, sin repetir
  stock: Record<string, number>; // una clave por talla de su categoría; entero 0..MAX_STOCK
  images: CatalogImage[]; // 1 a 8; images[0] es la portada
};

export type Catalog = {
  title: string; // hasta 60 caracteres, por defecto "Catálogo"
  currency: CatalogCurrency; // por defecto "COP"
  categories: CatalogCategory[]; // el orden del arreglo es el orden en pantalla
  products: CatalogProduct[]; // el orden del arreglo es el orden en pantalla ("Destacados")
};
```

`CatalogCurrency`, `CATALOG_CURRENCIES` y `formatPrice` no cambian. Se agregan helpers puros en `lib/catalog-shared.ts`: `sizesFor(category)` (`["Única"]` si `oneSize`, si no `CATALOG_SIZES`; sin categoría, `CATALOG_SIZES`), `stockTotal(product)` y `emptyStock(sizes)`.

Límites en `lib/content-limits.ts`: `MAX_PRODUCT_IMAGES` pasa de 4 a **8**; se agrega `MAX_STOCK = 9999`. El resto (40 productos, 10 categorías, 2 MB por imagen, nombre, descripción, precio) no cambia. Máximo teórico: 40 × 8 × 2 MB = 640 MB.

Reglas de validación en servidor:

- `colors`: de 1 a 6, de `CATALOG_COLORS`, sin repetir.
- Cada `images[].color` debe estar en `colors`; cada `images[].url` debe ser `https://` de Vercel Blob (regla de la SPEC 05) y de hasta `MAX_URL` caracteres.
- `stock`: las claves deben ser exactamente las de `sizesFor(categoría del producto)`; cada valor es un entero entre 0 y `MAX_STOCK`.
- `categoryId` es `null` o el id de una categoría existente; los `id` son únicos; el nombre de categoría no se repite.
- `currency`, `price`, límites de cantidad y de texto como en la SPEC 06. Un guardado que supere un tope se rechaza completo.

Persistencia y convenciones:

- Clave Redis `overcity:catalog:v2`. Si no existe, se lee `overcity:catalog:v1` y se convierte en memoria; `v1` nunca se modifica. El primer guardado escribe `v2`. Si ninguna existe o falla la lectura, valor por defecto `{ title: "Catálogo", currency: "COP", categories: [], products: [] }`.
- Conversión `v1` → `v2`: cada categoría con `oneSize: false`; cada producto con `colors: ["Negro"]`, cada imagen como `{ url, color: "Negro" }`, `stock` en 0 en todas sus tallas, y `buyUrl` descartado.
- Etiqueta de caché `catalog` y `getPublicCatalog()` (solo productos visibles) como en la SPEC 06; cada acción de escritura llama a `updateTag("catalog")`.
- Cada acción lee el catálogo completo de Redis, aplica el cambio, valida y escribe; el último guardado gana.
- Al guardar un producto, se borran de Blob las imágenes que tenía guardadas y que ya no están en ningún producto del catálogo. Al eliminar un producto, se borran las suyas. Siempre se escribe Redis antes de borrar archivos.
- Las imágenes siguen subiendo con `app/api/media/route.ts` (prefijo `catalog/`, 2 MB, PNG/JPG/WebP); no cambia.
- Las variables de entorno no cambian.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` las guías sobre `searchParams`, `useSearchParams` con `Suspense` y `cacheComponents`, componentes cliente con `Link`, y rutas dinámicas (aviso de Next.js 16 del `CLAUDE.md`); revisar los archivos actuales de catálogo (`lib/catalog.ts`, `app/catalogo/`, `app/admin/catalogo/`). Verificación: se sabe cómo leer `?categoria=` sin romper el build y cómo conservar el comportamiento 404 de `[id]`.
2. Pasar el modelo a `v2`: límites, `lib/catalog-shared.ts` (tipos, paleta, tallas, helpers) y `lib/catalog.ts` (validación, migración `v1`→`v2`, clave `v2`). Adaptar lo mínimo de las pantallas actuales para que compilen (sin `buyUrl`, imagen como `{ url, color }`). Verificación: `npm run lint` pasa, con un catálogo `v1` guardado `/catalogo` sigue mostrando sus productos y `v1` queda intacto en Redis.
3. Reescribir `app/admin/catalogo/actions.ts` con `saveCatalogSettings`, `saveCategories`, `saveProduct`, `deleteProduct`, `setProductVisible` y `moveProduct`, todas con sesión obligatoria, validación, `updateTag("catalog")` y borrado de Blob de imágenes sin uso. Verificación: sin sesión se rechazan; guardar un producto de prueba lo escribe en `v2`; un guardado inválido devuelve mensaje; las imágenes retiradas se borran de Blob y las en uso no.
4. Crear el armazón del panel (`app/admin/catalogo/layout.tsx` con barra lateral/superior) y las pantallas `Productos` (`page.tsx`), `Categorías` (`categorias/page.tsx`) y `Ajustes` (`ajustes/page.tsx`), con interruptor Visible, flechas, buscador y chips. Verificación: se crean, renombran, reordenan y eliminan categorías con confirmación; se edita título y moneda; se oculta un producto desde la lista; sin sesión pide la contraseña.
5. Crear la ficha `producto/[id]/page.tsx` con `product-editor.tsx` y `product-images.tsx` (reemplaza el actual): información, colores, stock, imágenes con subida a Blob, arrastrar, flechas, selección en lote y `Deshacer`, aviso al salir con cambios y `Guardar`/`Descartar`. Retirar el editor único anterior (`catalog-editor.tsx`). Verificación: se crea un producto con 8 fotos y varios colores, se reordena, se asignan colores, se guarda y se recarga igual; la novena foto, una de más de 2 MB y un guardado sin foto se rechazan con mensaje.
6. Crear el armazón de la tienda (`app/_components/store-shell.tsx`: fondo y efectos de `SiteContent`, encabezado) y `/catalogo` con `catalog-browser.tsx` (cliente): buscador, orden, chips, `?categoria=`, tarjetas y estado vacío. Verificación: lo guardado en el panel aparece; buscar sin tildes, ordenar por precio y filtrar por categoría funcionan; un producto sin stock muestra `AGOTADO`.
7. Reescribir `/catalogo/[id]` con `product-detail.tsx` (cliente): galería por color, selector de talla con mensajes, 404 para ocultos e inexistentes. Verificación: cambiar de color cambia las fotos y el contador; una talla en 0 sale tachada y deshabilitada; un oculto da 404.
8. En `app/_components/site-view.tsx`, agregar los botones de categoría debajo de `Ver catálogo` (props desde `app/page.tsx` con `getPublicCatalog()`). Verificación: aparece un botón por categoría con productos visibles, lleva a `/catalogo?categoria=<id>` con ese chip activo y desaparece al ocultar sus productos.
9. Actualizar `CLAUDE.md` (modelo `v2`, clave, rutas, límites, regla de layout de la tienda) y revisar `npm run build`, `npm run lint` y los 360 px de todas las pantallas. Verificación: el texto coincide con el código y se cumplen los criterios de aceptación.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] Con un catálogo `v1` guardado, tras actualizar los productos siguen visibles con color `Negro` y stock 0 (`AGOTADO`), y la clave `overcity:catalog:v1` no cambia.
- [ ] Sin catálogo guardado, `/` se ve igual que antes (sin botón `Ver catálogo` ni de categorías), `/catalogo` muestra el estado vacío y `/admin/catalogo` abre en `Productos` sin productos.
- [ ] `/admin/catalogo` y todas sus subrutas sin sesión muestran el formulario de contraseña y no entregan datos; las acciones sin sesión se rechazan.
- [ ] Se puede crear una categoría, un producto en ella y uno sin categoría; tras guardar aparecen en `/catalogo` en el orden del panel.
- [ ] Un producto con 8 fotos se guarda; subir una novena se rechaza con mensaje. Una imagen de más de 2 MB o que no sea PNG/JPG/WebP se rechaza con mensaje.
- [ ] No se puede guardar un producto sin nombre, sin foto o con una subida en curso; el botón `Guardar` está deshabilitado mientras no haya cambios.
- [ ] La primera foto es la portada en la tarjeta y en la categoría de la home; reordenar con arrastre o con `←` `→` cambia la portada tras guardar.
- [ ] Quitar un color pasa sus fotos al primer color restante; no se puede dejar el producto sin colores.
- [ ] Asignar color y eliminar en lote desde el modo selección funciona; `Deshacer` restaura las fotos eliminadas en el borrador.
- [ ] Las celdas de stock siguen las tallas de la categoría (`XS`–`XL`, o `Única` si es de talla única); cambiar la categoría del producto o el interruptor `Talla única` ajusta las celdas.
- [ ] Un guardado con color fuera de la paleta, `stock` con tallas que no corresponden o negativo/decimal, imagen con color que el producto no tiene, imagen que no es de Vercel Blob, `categoryId` inexistente o más de 8 imágenes se rechaza en el servidor.
- [ ] Con 40 productos `Nuevo producto` queda deshabilitado, y con 10 categorías `Crear categoría` también; el servidor rechaza 41 y 11.
- [ ] El interruptor Visible de la lista se guarda al momento; el oculto no aparece en `/catalogo` ni en la home y `/catalogo/[id]` responde 404; al volver a Visible reaparece.
- [ ] Eliminar una categoría deja sus productos como `Sin categoría` sin borrarlos, tras confirmar en el `<dialog>`.
- [ ] Al guardar un producto con fotos retiradas o al eliminarlo, los archivos sin uso se borran de Blob; los que siguen en uso no se tocan. Fotos subidas pero no guardadas no cambian lo publicado.
- [ ] `/catalogo` busca ignorando tildes y mayúsculas por nombre y categoría, ordena por precio menor y mayor (sin precio al final) y `Destacados` respeta el orden del panel.
- [ ] Los chips muestran `Todos` y solo categorías con productos visibles, con su contador; `/catalogo?categoria=<id>` abre con ese chip activo y `Limpiar filtros` lo restablece.
- [ ] Las tarjetas muestran puntos de color, contador de fotos, `AGOTADO` cuando el stock total es 0 y la segunda foto al pasar el cursor.
- [ ] En `/catalogo/[id]`, elegir un color muestra solo sus fotos (o todas si ese color no tiene), una talla con stock 0 sale tachada y deshabilitada, y el mensaje cambia entre `Elige tu talla`, `¡Quedan N!` (3 o menos), `Disponible` y `Agotado`.
- [ ] El detalle no tiene bolsa, cantidad ni botón de compra, y el encabezado no tiene candado ni bolsa.
- [ ] En `/` hay un botón por categoría con productos visibles bajo `Ver catálogo`; no cuentan para el tope de 20 links ni aparecen en el editor de links de `/admin`.
- [ ] Precio `85000` con `COP` se muestra sin decimales; cambiar la moneda en `Ajustes` actualiza el formato en toda la tienda y la ficha.
- [ ] Todo control de icono tiene `aria-label`, las imágenes de producto tienen `alt` con el nombre, los interruptores usan `role="switch"` y todo se alcanza con Tab con foco visible.
- [ ] No hay scroll horizontal a 360 px en `/`, `/catalogo`, `/catalogo/[id]` ni en ninguna pantalla de `/admin/catalogo` con 40 productos; la barra del panel cambia a superior en móvil sin tapar contenido.
- [ ] `BLOB_READ_WRITE_TOKEN` y los tokens de subida no aparecen en el HTML ni en el JavaScript público.

## Decisiones

- **Sí:** partir el diseño en specs. Este spec cubre tienda pública y panel de catálogo; bolsa, checkout y pedidos son specs aparte porque tocan flujo de compra, stock concurrente y un panel nuevo.
- **Sí:** catálogo `v2` en clave nueva `overcity:catalog:v2`, con `v1` convertido en memoria y nunca modificado, igual que `SiteContent` en la SPEC 03. Permite volver atrás sin perder datos.
- **Sí:** colores de una paleta fija de 6 (la del diseño) y tallas fijas `XS`–`XL` o `Única`. Cumple la regla de no inventar colores y permite validar en servidor.
- **No:** colores o tallas personalizados. El diseño no los tiene y exigirían otro modelo y otro panel.
- **Sí:** stock por talla en el producto, con las claves determinadas por la categoría (`oneSize`). Es lo que el diseño muestra (tachado, `¡Quedan N!`, `AGOTADO`).
- **Sí:** quitar `buyUrl`. El botón de compra desaparece de este spec y la compra se define con la bolsa y WhatsApp; conservar un campo sin uso solo ocupa espacio y confunde.
- **Sí:** 8 fotos por producto (antes 4), con color por foto, arrastrar para subir y reordenar y modo selección. Fue lo elegido; sube el máximo teórico a 640 MB, aceptado.
- **Sí:** flechas `←` `→` además de arrastrar. El arrastre del diseño solo funciona en escritorio; las flechas dan reordenado en móvil y por teclado.
- **No:** visor con zoom y encuadre por foto. Se pidió dejarlo fuera; añadiría mucho código cliente y campos `z/x/y`.
- **Sí:** guardado por ficha, con categorías, ajustes y visibilidad guardándose al momento. Reemplaza el botón único global de la SPEC 06. Cada acción lee, valida y escribe el catálogo entero; el último guardado gana, aceptado para un único administrador.
- **Sí:** panel con subrutas (`producto/[id]`, `categorias`, `ajustes`) en vez de un solo componente con estado. Cada pantalla se recarga y se enlaza por URL; la ficha de producto nuevo usa el id `nuevo` y genera el uuid al guardar.
- **Sí:** añadir `Ajustes` en la barra del panel para el título y la moneda. El diseño no lo tiene, pero el modelo lo necesita y no puede quedar sin pantalla.
- **Sí:** flechas para reordenar productos en la lista del panel. El diseño no las trae, pero se conserva la capacidad de la SPEC 06 y `Destacados` depende del orden.
- **Sí:** buscador y orden en cliente sobre hasta 40 productos, sin llamadas al servidor. Mantiene la vista rápida y reemplaza la decisión de la SPEC 06 de no tener filtros.
- **Sí:** filtro de categoría por `?categoria=<id>` para que los botones de la home enlacen a una vista concreta.
- **Sí:** botones de categoría en la home, como en el diseño. Resuelve lo que la SPEC 06 dejó para después. `/` sigue en `max-w-md`.
- **No:** `Lo nuevo`, `NUEVO`, tarjetas de envíos, candado y bolsa en el encabezado. No se marcaron para este spec.
- **Sí:** tienda ancha (hasta 1240 px) en `/catalogo` y `/catalogo/[id]`. Es una excepción a la regla `max-w-md` de la SPEC 04, que se documenta en `CLAUDE.md`; la home de links, los modales y el panel de `/admin` no cambian de ancho.
- **Sí:** el fondo y los efectos de la tienda salen de `SiteContent`, para que el fondo editable de la SPEC 05 también valga en la tienda.
- **No:** música en la tienda. No está en el diseño; la SPEC 04 prohíbe controles flotantes sobre barras y el encabezado fijo ocupa ese lugar.
- **Sí:** eliminar categoría y producto con confirmación en `<dialog>` en vez de `Deshacer`, porque esas acciones se guardan al momento y deshacerlas obligaría a reescribir Redis y Blob.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Los productos migrados de `v1` quedan con stock 0 y salen como `AGOTADO` hasta editarlos | Aceptado: no se inventa stock. Se documenta en el spec y se corrige desde la ficha. |
| Apagar `Talla única` en una categoría pone sus productos en stock 0 (el diseño hace igual) | Mensaje en el panel antes de confirmar el cambio; encender conserva el total sumado. |
| Dos pestañas del panel guardan a la vez y una pisa a la otra (ahora con acciones más pequeñas) | Aceptado para un único administrador; el último guardado gana. |
| Subir fotos que luego no se guardan deja archivos huérfanos en Blob | Aceptado (igual que SPEC 05 y 06); el tope de 2 MB acota el costo y se revisan desde Vercel. |
| Un fallo al borrar archivos tras escribir Redis deja huérfanos, no enlaces rotos | Siempre se escribe Redis primero y se borra después. |
| `?categoria=` con `cacheComponents` rompe el build o la caché de `/catalogo` | Se lee en cliente con `useSearchParams` dentro de `Suspense` y se verifica con `npm run build`. |
| Rejilla ancha con nombres largos o 8 miniaturas desborda a 360 px | `truncate`, rejilla `auto-fill` con mínimo en porcentaje y comprobación en los criterios. |
| Arrastrar y soltar no funciona en móvil | Las flechas `←` `→` cubren el reordenado en todos los dispositivos. |
| El audio de la home se corta al entrar a la tienda (sin música en esas páginas) | Aceptado en este spec; se retoma con el spec de bolsa si se quiere continuidad. |
| El diseño de referencia es un bundle con datos de ejemplo y textos como `Envíos a toda Colombia` | Solo se toma la estructura y los estilos; los textos de ejemplo no pasan al código si no vienen del catálogo. |

## Lo que **no** está en este spec

- Bolsa, checkout, pedidos y panel de pedidos.
- Botón de compra, WhatsApp y selector de cantidad.
- Marca `Nuevo` y sección `Lo nuevo`.
- Tarjetas de envíos y cambios.
- Candado de admin en el encabezado.
- Visor de recorte y zoom de fotos.
- Música en la tienda.
- Colores o tallas personalizados y varios catálogos.
- Open Graph y SEO por producto.

Cada uno, si se hace, va en su propio spec.
