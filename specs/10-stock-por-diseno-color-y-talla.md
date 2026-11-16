# SPEC 10 — Diseños en los productos: stock por diseño, color y talla, y pedido de WhatsApp por diseño

> **Estado:** Implementado
> **Depende de:** SPEC 06, SPEC 07, SPEC 08, SPEC 09
> **Fecha:** 2026-11-16
> **Objetivo:** Introducir el **diseño** como unidad del producto (cada foto es un diseño distinto, con su nombre, sus colores y su stock por talla), de modo que el inventario, la tienda, la bolsa y el mensaje de WhatsApp distingan diseño + color + talla.

## Por qué existe este spec

Hoy un producto (p. ej. una camiseta) tiene un solo stock por color y talla (SPEC 09) y varias fotos que solo se distinguen por color. En la práctica cada foto es una camiseta **distinta**: otro diseño. El inventario real es "cuántas camisetas del diseño X, en color Y y talla Z", y el pedido que llega por WhatsApp tiene que decir de qué diseño es cada prenda, para poder prepararlo y entregarlo bien. Con el modelo actual dos diseños distintos comparten el mismo stock y el mismo renglón en la bolsa.

Este spec crea el concepto de **diseño** y mueve a él los colores, la foto y el stock. El producto sigue teniendo un precio, una descripción y una categoría.

## Alcance

**Dentro:**

- **Diseño** como nuevo nivel dentro del producto: `nombre` obligatorio, **una** foto, **sus propios colores** (1–6 de la paleta) y **su propio stock** por color y talla. De 1 a 8 diseños por producto; el primero es la portada.
- **Modelo del producto:** los campos `colors`, `images` y `stock` del producto desaparecen y pasan a vivir en cada diseño. El producto conserva `name`, `description`, `price`, `categoryId` y `visible`.
- **Una sola versión del catálogo**, la clave `overcity:catalog:v2`. El producto con la forma anterior (SPEC 09: `colors`, `images` con color y `stock[color][talla]`) se convierte en memoria al leer y el primer guardado escribe la forma nueva. La forma de la SPEC 06/07 (stock por talla) pasa primero por la conversión de la SPEC 09 y luego por esta.
- **Conversión del producto existente:**
  - cada imagen actual pasa a ser un diseño llamado `Diseño 1`, `Diseño 2`… según su orden;
  - cada diseño recibe como colores **todos los colores del producto** (no se pierde ninguno); la foto deja de tener color propio;
  - el stock actual por color y talla va al **primer diseño** y los demás diseños quedan en 0. El total no cambia.
- **Ficha de producto en el panel** (`/admin/catalogo/producto/[id]`):
  - sección `Diseños` (reemplaza `Imágenes` y `Colores`): por diseño, foto (subida con arrastrar y soltar), nombre, selector de colores y botones ← → para reordenar y `Quitar` con deshacer; hasta 8;
  - sección `Stock por diseño, color y talla`: una tabla por diseño (una fila por color del diseño, una celda por talla) con total por color, total por diseño y total general.
- **Detalle `/catalogo/[id]`:**
  - la galería pasa a ser un selector de diseños (miniaturas con nombre accesible) y la foto grande es la del diseño elegido;
  - los colores ofrecidos son los del diseño elegido; un color sin stock en ninguna talla se tacha pero se puede elegir;
  - las tallas se tachan según el stock de diseño + color;
  - el mensaje (`Elige tu talla`, `¡Quedan N!` con 3 o menos, `Disponible`, `Agotado`) y el tope de cantidad usan el stock de diseño + color + talla;
  - diseño inicial: el primero con stock (o el primero si ninguno tiene); color inicial: el primero con stock en ese diseño;
  - al cambiar de diseño, si el color elegido no existe en el nuevo diseño se pasa al primer color con stock de ese diseño; si la talla elegida no tiene stock en la nueva combinación, se deselecciona.
- **Bolsa:** `CartLine` gana `designId`; una línea es producto + diseño + color + talla. El tope de cantidad, la reconciliación y el selector del cajón usan el stock de diseño + color + talla. La miniatura de la línea es la foto del diseño.
- **Líneas guardadas sin diseño:** la reconciliación las quita con el aviso `Actualizamos tu bolsa…` ya existente.
- **Mensaje de WhatsApp** del pedido y de la consulta: cada línea incluye el diseño (ver formato abajo).
- **Tienda y lista del panel:** la portada de la tarjeta es la foto del primer diseño; el stock total suma todos los diseños, colores y tallas; `AGOTADO` con total 0; los puntos de color de la tarjeta, si existen, muestran la unión de los colores de los diseños.
- **Cambio de categoría y de `Talla única`:** cada color de cada diseño conserva la lógica actual (apagar `Talla única` deja sus celdas en 0; encenderla suma las tallas de ese color).
- **Quitar un diseño** quita su foto del Blob al guardar (si ningún otro diseño la usa) y su stock; **quitar un color de un diseño** quita su fila de stock; agregar un color agrega su fila en 0.
- Validación en servidor de la forma nueva con mensajes visibles.
- Actualizar `CLAUDE.md` (modelo de diseño, conversión, tope y formato de la bolsa).

**Fuera de alcance (specs futuros):**

- Precio distinto por diseño, color o talla; SKU o variantes con datos propios.
- Más de una foto por diseño (ángulos, detalle).
- Filtrar o buscar por diseño en `/catalogo` (la búsqueda sigue siendo por nombre de producto y categoría).
- Descuento de stock al enviar el pedido, reservas, pedidos guardados, panel de pedidos o módulo de entregas (el mensaje de WhatsApp es el medio para coordinar la entrega).
- Alertas de stock bajo, historial de movimientos o carga masiva.
- Colores o tallas personalizados.
- Quitar la lectura de `overcity:catalog:v1`.
- Cambiar la clave `overcity:cart:v1`.

## Modelo de datos

Tipos y helpers en `lib/catalog-shared.ts` (aptos para el cliente); validación, conversión y Redis en `lib/catalog.ts`.

```ts
export type CatalogDesign = {
  id: string;                                   // estable dentro del producto; no cambia al reordenar o renombrar
  name: string;                                 // 1..MAX_DESIGN_NAME caracteres, obligatorio
  image: string;                                // URL de Vercel Blob (png/jpg/webp, máx. 2 MB), una sola foto
  colors: CatalogColor[];                       // 1..6 de la paleta, sin repetir
  stock: Record<string, Record<string, number>>; // stock[color][talla]
};

export type CatalogProduct = {
  // …campos sin cambios (id, name, description, price, categoryId, visible)
  // antes: colors, images, stock
  designs: CatalogDesign[];                     // 1..8; el primero es la portada
};
```

Reglas de validación en servidor:

- `designs`: de 1 a `MAX_DESIGNS` (8). Los `id` son únicos dentro del producto.
- `name`: texto sin espacios sobrantes, de 1 a `MAX_DESIGN_NAME` (40) caracteres. Nombres repetidos dentro del mismo producto se rechazan con mensaje (en WhatsApp se vuelven ambiguos).
- `image`: URL de Blob con el mismo patrón validado hoy para las imágenes del catálogo.
- `colors`: de 1 a 6 colores de `CATALOG_COLORS`, sin repetir.
- `stock`: las claves del primer nivel son **exactamente** `design.colors`; las del segundo nivel, **exactamente** `sizesFor(categoría del producto)`; cada valor es un entero entre 0 y `MAX_STOCK` (9999).
- Tope por producto: 8 diseños × 6 colores × 5 tallas = 240 celdas.

Helpers puros en `lib/catalog-shared.ts` (los de la SPEC 09 se adaptan):

- `stockOf(product, designId, color, size)`: cantidad de una combinación; 0 si no existe.
- `colorStock(design, color)`: suma de las tallas de un color de un diseño.
- `designStock(design)`: suma de todo un diseño.
- `stockTotal(product)`: suma de todos los diseños.
- `productColors(product)`: unión ordenada de los colores de sus diseños.
- `coverImage(product)`: foto del primer diseño.
- `emptyStock(colors, sizes)` y `resizeStock(...)`: se conservan y se aplican por diseño.

Persistencia y convenciones:

- Clave Redis `overcity:catalog:v2`. **No se crea clave nueva.** La detección de la forma anterior es por producto: un producto sin `designs` y con `images` se convierte en memoria como se describe en el alcance. El primer guardado escribe la forma nueva; desde entonces el código anterior no puede leer los diseños. Se acepta para un único administrador.
- `overcity:catalog:v1` sigue sin modificarse; su conversión pasa por la de la SPEC 09 y luego por esta (resultado: un producto con un diseño `Diseño 1`, colores `["Negro"]`, stock en 0).
- La ids de diseño se generan igual que las de producto y categoría (se confirma el generador en el paso 1).
- `CartCatalog` (resumen para el proveedor de la bolsa) lleva `designs` con `id`, `name`, `image`, `colors` y `stock`.
- **Bolsa** (`localStorage["overcity:cart:v1"]`, misma clave):

```ts
export type CartLine = {
  productId: string;
  designId: string;      // nuevo: id de un diseño del producto
  color: CatalogColor;   // un color de ese diseño
  size: string;          // una clave del stock de ese color
  qty: number;           // entero 1..stock de diseño + color + talla
};
```

  `readCart` tolera líneas del formato anterior (sin `designId`) y `reconcileCart` las quita con el aviso. Dos líneas del mismo producto con distinto diseño, color o talla son líneas separadas; `MAX_CART_LINES` (30) no cambia.

- **Formato del mensaje del pedido** (cambia respecto a la SPEC 08: se agrega el diseño):

```
Hola {marca}, quiero hacer este pedido:

1. {nombre} — Diseño: {diseño} — {color}, {talla} × {qty} — {total de línea | Consultar}
   {origen}/catalogo/{id}
2. …

Subtotal: {subtotal}
{Envío gratis incluido | }
```

  El mensaje de consulta del detalle agrega `Diseño: …` junto a `Color: …` y `Talla: …` cuando están elegidos. El diseño no se pide para consultar.

- Límites en `lib/content-limits.ts`: nuevas `MAX_DESIGNS = 8` y `MAX_DESIGN_NAME = 40`; el tope de 8 imágenes por producto pasa a ser el de diseños (una foto cada uno); 2 MB por imagen y `MAX_STOCK` no cambian.
- Las variables de entorno no cambian. `/api/media` sigue aceptando el prefijo `catalog/`.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` lo relacionado con `"use cache"` y props serializables hacia componentes cliente (aviso de Next.js 16 del `CLAUDE.md`) y revisar todos los lugares que leen `product.colors`, `product.images` o `product.stock`: `lib/catalog-shared.ts`, `lib/catalog.ts`, `lib/cart.ts`, `app/_components/store-shell.tsx`, `cart-provider.tsx`, `cart-drawer.tsx`, `app/_components/site-view.tsx` (botones por categoría con portada), `app/catalogo/_components/catalog-browser.tsx`, `app/catalogo/[id]/_components/product-detail.tsx`, `app/admin/catalogo/_components/product-editor.tsx`, `product-images.tsx`, la lista de productos y `app/admin/catalogo/actions.ts`. Verificación: se tiene la lista completa de sitios y se confirma cómo se generan los ids.
2. Modelo y conversión: tipos `CatalogDesign` y nuevo `CatalogProduct`, helpers y límites en `lib/catalog-shared.ts` y `lib/content-limits.ts`; validación, conversión en memoria del producto anterior y adaptación de la conversión `v1` en `lib/catalog.ts`. Adaptar lo mínimo de las pantallas para que compilen (portada = `coverImage`, colores = `productColors`). Verificación: `npm run lint` pasa; con un catálogo `v2` de la SPEC 09, `/catalogo` muestra los mismos productos, cada imagen vieja es un diseño `Diseño N` con todos los colores del producto, el primer diseño tiene todo el stock y el total de cada producto no cambia; un stock que no coincide con los colores del diseño o con las tallas, valores negativos o decimales, nombres vacíos o repetidos, más de 8 diseños o un color repetido se rechazan en la validación.
3. Acciones del panel: `saveProduct`, `saveCategories` y `saveCatalogSettings` trabajan con la forma nueva; cambiar `oneSize` de una categoría reajusta el stock por diseño y color; se borran del Blob las fotos que ningún diseño use. Verificación: sin sesión se rechazan; guardar un producto escribe `designs[].stock[color][talla]` en `v2`; encender y apagar `Talla única` ajusta las celdas como se describe en el alcance; quitar un diseño borra su foto del Blob.
4. Ficha de producto, diseños: sección `Diseños` en `product-editor.tsx` (reemplaza `product-images.tsx` por una versión por diseño): subida con arrastrar y soltar, nombre, colores, ← →, `Quitar` con deshacer, tope de 8. Verificación: se crean 3 diseños con nombres y colores distintos, se guarda, se recarga y queda igual; el orden define la portada; un nombre repetido o vacío bloquea el guardado con mensaje.
5. Ficha de producto, stock: sección `Stock por diseño, color y talla` (una tabla por diseño con totales; agregar o quitar colores y cambiar de categoría ajustan las tablas). Verificación: se carga stock distinto en cada celda de dos diseños, se guarda, se recarga y queda igual; quitar un color de un diseño elimina su fila sin tocar los otros diseños.
6. Lógica de la bolsa: `lib/cart.ts` (`addLine`, `setQty`, `removeLine`, `reconcileCart`, tope por línea, `buildOrderMessage`, `buildInquiryMessage`) usa `designId` y `stockOf(diseño, color, talla)`; `CartCatalog` y `cart-provider.tsx` pasan los diseños. Verificación: con casos manuales en Node, la misma combinación suma sin pasar del stock de ese diseño + color + talla, dos diseños del mismo producto son líneas separadas, una línea sin `designId` o con un diseño que ya no existe se quita al reconciliar, y el mensaje incluye `Diseño: …` con tildes y `&` bien codificados.
7. Detalle y cajón: `product-detail.tsx` (selector de diseños con miniaturas, colores del diseño, tallas tachadas por diseño + color, diseño y color iniciales con stock, ajuste al cambiar de diseño, mensaje y tope por combinación) y el cajón (miniatura del diseño, línea `Diseño · Color · Talla`, tope por combinación). Verificación: diseño A con Negro M en 2 y diseño B con Negro M en 0: en A, M se elige y la cantidad llega a 2; al pasar a B, M queda tachada y deseleccionada; el cajón no deja subir una línea de A Negro M de 2; abrir WhatsApp muestra el diseño en cada línea.
8. Lista del panel, tarjetas, home y `CLAUDE.md`: confirmar que `stockTotal` suma todos los diseños en la lista, las tarjetas y `AGOTADO`; que las portadas de la tienda y de los botones por categoría de la home usan la foto del primer diseño; actualizar `CLAUDE.md` (modelo de diseño, conversión, tope y formato del mensaje); revisar `npm run build`, `npm run lint` y los 360 px de la ficha, el detalle y el cajón. Verificación: el texto coincide con el código y se cumplen los criterios de aceptación.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores, y `/catalogo` y `/catalogo/[id]` siguen sirviéndose desde caché.
- [ ] Un catálogo `v2` guardado antes de este spec carga sin errores: cada imagen es un diseño `Diseño N` con todos los colores del producto, el primer diseño conserva todo el stock, los demás quedan en 0 y el stock total de cada producto no cambia.
- [ ] La clave `overcity:catalog:v1` no se modifica y no se crea ninguna clave nueva de catálogo; el primer guardado escribe la forma nueva en `overcity:catalog:v2`.
- [ ] En la ficha se pueden crear hasta 8 diseños, cada uno con foto, nombre obligatorio y 1–6 colores propios; se pueden reordenar (el primero es la portada) y quitar con deshacer; un nombre vacío o repetido en el mismo producto se rechaza con mensaje.
- [ ] La tabla de stock tiene, por diseño, una fila por color de ese diseño y una columna por talla de la categoría; hay total por color, por diseño y general; cambiar de categoría o `Talla única` ajusta las columnas de todas las tablas.
- [ ] Agregar un color a un diseño agrega su fila en 0; quitarlo la elimina sin afectar a los otros diseños; quitar un diseño elimina su stock y, al guardar, su foto del Blob.
- [ ] Guardar y recargar un producto conserva cada nombre, foto, color y celda de stock.
- [ ] El servidor rechaza un guardado con `stock` cuyos colores no coinciden con los del diseño, cuyas tallas no coinciden con las de la categoría, con valores negativos, decimales o mayores a `MAX_STOCK`, con más de 8 diseños o con colores repetidos en un diseño. Sin sesión la acción se rechaza.
- [ ] En `/catalogo/[id]`, elegir un diseño cambia la foto grande y los colores ofrecidos a los de ese diseño; las tallas se tachan según diseño + color; el mensaje (`Elige tu talla`, `¡Quedan N!` con 3 o menos, `Disponible`, `Agotado`) corresponde a diseño + color + talla.
- [ ] El diseño inicial es el primero con stock (o el primero) y el color inicial el primero con stock de ese diseño; al cambiar de diseño, un color inexistente en el nuevo diseño pasa al primer color con stock y una talla sin stock se deselecciona.
- [ ] La cantidad del detalle y del cajón no supera el stock de diseño + color + talla; agregar de nuevo la misma combinación suma sin pasarlo; dos diseños del mismo producto son líneas separadas.
- [ ] El cajón muestra la foto del diseño y la línea `Diseño · Color · Talla`.
- [ ] El mensaje de WhatsApp del pedido incluye el diseño en cada línea y el de consulta incluye `Diseño: …` solo si está elegido; tildes, saltos de línea y `&` llegan bien.
- [ ] Al cargar, una línea de la bolsa sin `designId`, con un diseño que ya no existe o cuya combinación ya no tiene stock se quita con el aviso `Actualizamos tu bolsa…`, y una cantidad mayor al stock se recorta.
- [ ] La tarjeta muestra `AGOTADO` solo cuando el total de todos los diseños, colores y tallas es 0; la lista del panel muestra ese mismo total; la portada es la foto del primer diseño en la tienda y en los botones por categoría de la home.
- [ ] No hay scroll horizontal a 360 px en la ficha con 8 diseños (tablas con desplazamiento interno), en `/catalogo/[id]` con 8 diseños ni en el cajón con 30 líneas.
- [ ] No se descuenta stock ni se guarda ningún pedido; las variables de entorno y la clave `overcity:cart:v1` no cambian.

## Decisiones

- **Sí:** el diseño es un nivel nuevo dentro del producto con su foto, colores y stock. Es lo que pidió el usuario: cada foto es una camiseta distinta y el inventario se lleva por diseño, color y talla. Mantener el stock en el producto no permite distinguirlos.
- **Sí:** cada diseño tiene **sus propios colores** (decisión del usuario). Un diseño puede existir solo en algunos colores; el stock cuadra exactamente con los colores del diseño.
- **No:** colores compartidos por todo el producto. Era más simple, pero obliga a registrar combinaciones que no existen.
- **Sí:** una sola foto por diseño. "Cada foto es un diseño" es la definición dada; varias fotos por diseño serían otro spec.
- **Sí:** nombre del diseño obligatorio y único dentro del producto. Es lo que lee quien prepara el pedido en WhatsApp; `Diseño 2` cambiaría al reordenar y un nombre repetido sería ambiguo.
- **Sí:** el stock vive dentro del diseño (`design.stock[color][talla]`) en lugar de un mapa aparte a nivel de producto. Elimina claves huérfanas al quitar un diseño o un color y mantiene juntos foto, colores y stock.
- **Sí:** una sola versión del catálogo (`overcity:catalog:v2`) con conversión en memoria, igual que la SPEC 09. No se acumulan claves.
- **Sí:** en la conversión, cada imagen vieja es un diseño y el stock completo va al primer diseño (los demás en 0), con todos los colores del producto. No inventa unidades y no pierde colores; el admin reparte desde la ficha.
- **No:** copiar el stock a cada diseño (infla el total y permite vender lo que no existe) ni usar el color de la foto como único color del diseño (perdería los demás colores y el stock asociado).
- **Sí:** `CartLine` gana `designId` y las líneas guardadas sin él se descartan con el aviso existente. Asignarlas al primer diseño podría entregar una prenda que el cliente no eligió.
- **Sí:** se conserva la clave `overcity:cart:v1`; la forma antigua se tolera al leer y se limpia en la reconciliación, sin una clave nueva.
- **Sí:** el mensaje de WhatsApp se cambia para incluir el diseño. Es el medio por el que la entrega sabe qué preparar; no se crea un módulo de pedidos o entregas.
- **Sí:** el stock sigue siendo informativo y no se descuenta, como en las SPEC 08 y 09.
- **Sí:** el precio sigue siendo del producto; precios por diseño exigirían otro modelo y otro mensaje.
- **Sí:** la búsqueda de la tienda no cambia (producto y categoría); filtrar por diseño es otro spec.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Tras el primer guardado, el código anterior no puede leer `designs` | Aceptado para un único administrador; se documenta en `CLAUDE.md`. |
| Tras actualizar, los productos con varias imágenes muestran todos los diseños menos el primero agotados hasta repartir el stock | Aceptado: no se inventa stock. El total no cambia y se corrige desde la ficha. |
| Un producto cuyas imágenes eran ángulos de la misma prenda queda convertido en varios diseños | El admin los une quitando los sobrantes desde la ficha; el stock del primer diseño ya concentra todo. |
| Una bolsa guardada tiene líneas sin diseño o de un diseño ahora sin stock | La reconciliación al cargar quita la línea o recorta la cantidad y avisa. |
| La ficha con 8 diseños × 6 colores × 5 tallas se vuelve larga y desborda a 360 px | Una tabla por diseño, plegable y con desplazamiento interno y primera columna fija; se comprueba en los criterios. |
| Quitar un diseño o un color por error pierde su stock | La ficha no publica nada hasta `Guardar`; `Descartar` restaura el borrador; `Quitar` de un diseño ofrece deshacer. |
| Apagar `Talla única` pone en 0 el stock de cada color de cada diseño | Mensaje en el panel antes de confirmar el cambio. |
| Forma mixta (productos con forma anterior y con diseños) | La detección es por producto, no global. |
| El mensaje de WhatsApp se alarga con el nombre del diseño | Nombre limitado a 40 caracteres y 30 líneas máximo; se prueba el enlace con 30 líneas. |
| Dos pedidos pueden pedir el último de un diseño porque el stock no se descuenta | Aceptado: el stock es informativo; la conversación en WhatsApp confirma disponibilidad. |

## Lo que **no** está en este spec

- Precio, SKU o variantes propias por diseño, color o talla.
- Más de una foto por diseño.
- Filtro o búsqueda por diseño en la tienda.
- Descuento de stock, reservas, pedidos guardados, panel de pedidos o módulo de entregas.
- Alertas de stock bajo, historial o carga masiva.
- Colores o tallas personalizados.
- Quitar la lectura de `overcity:catalog:v1`.

Cada uno, si se hace, va en su propio spec.
