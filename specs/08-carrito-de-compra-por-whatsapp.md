# SPEC 08 — Carrito de compra que envía el pedido por WhatsApp

> **Estado:** Aprobado
> **Depende de:** SPEC 04, SPEC 06, SPEC 07
> **Fecha:** 2026-11-14
> **Objetivo:** Agregar a la tienda una bolsa de compra (cajón lateral con el estilo de `references/pages/OverCity Tienda.html`) cuyo botón final abre WhatsApp con el detalle de los productos elegidos, hacia un número que el admin configura en los ajustes del catálogo.

## Por qué existe este spec

La SPEC 07 dejó fuera la bolsa, el selector de cantidad y el botón de compra, y anunció que el flujo de WhatsApp se definiría con la bolsa. El diseño de referencia trae una bolsa completa (botón en el encabezado, cajón lateral, líneas con cantidad, subtotal, barra de envío gratis) y un checkout de tres pasos con pedidos guardados. Hoy no hace falta un checkout ni un panel de pedidos: la venta se cierra conversando por WhatsApp. Por eso este spec toma **la bolsa y sus estilos** y reemplaza el `Finalizar compra` del diseño por `Enviar pedido por WhatsApp`. Checkout, pedidos y descuento de stock siguen fuera.

Este spec retoma lo que la SPEC 07 dejó explícitamente fuera (bolsa, selector de cantidad, botón de compra, `Preguntar por WhatsApp`). El resto de lo excluido allí (candado, `Nuevo`, envíos y cambios, visor de fotos, música) sigue excluido.

La referencia es un bundle con estilos en línea; es referencia visual y de comportamiento, no se copia su runtime. Se reimplementa con componentes de Next.js y Tailwind siguiendo la SPEC 04, y sus textos de ejemplo (`Medellín`, `Envíos a toda Colombia`, montos de envío) no pasan al código.

## Alcance

**Dentro:**

- **Bolsa del visitante**, guardada en `localStorage` (clave `overcity:cart:v1`), con una línea por producto + color + talla y su cantidad. Sin servidor, sin cuentas.
- **Botón de bolsa en el encabezado de la tienda** (`/catalogo` y `/catalogo/[id]`): píldora con icono de bolsa y contador de unidades, fondo `rgba(216,26,33,.2)` y borde `theme-red`, `aria-label="Abrir bolsa"`. El contador no se muestra en 0.
- **Cajón de la bolsa** (`<dialog>` con `showModal`, panel pegado a la derecha, ancho `min(440px,100%)`), con el estilo del diseño:
  - Fondo `rgba(10,28,41,.7)` con `blur(4px)`; panel marino `rgba(10,28,41,.96)`, borde izquierdo `rgba(255,48,72,.4)`, sombra roja tenue, entrada deslizando desde la derecha (`.3s`); sin animación con `prefers-reduced-motion`.
  - Cabecera `Tu bolsa` + contador de unidades y botón `Cerrar` (icono con `aria-label`).
  - **Barra de envío gratis:** mensaje (`Te faltan $X para envío gratis` / `Tu envío es gratis`) y barra de progreso roja con resplandor. Solo aparece si el admin definió el umbral.
  - **Líneas:** miniatura 72×90 de la foto del color elegido (o la portada si ese color no tiene), nombre, `Color · Talla`, selector `−` `N` `+` (tope = stock de esa talla), total de la línea y `Quitar`. Un producto sin precio muestra `Consultar` y no suma al subtotal.
  - **Estado vacío:** `Tu bolsa está vacía` con botón `Ver catálogo`.
  - **Pie:** `Subtotal` y botón `Enviar pedido por WhatsApp` (píldora roja, `h-13`, resplandor al hover; deshabilitado si la bolsa está vacía o no hay número).
  - Cierra con `Cerrar`, tecla Esc o clic en el fondo; devuelve el foco al botón que lo abrió.
- **Aviso `Prenda quitada` con `Deshacer`** al quitar una línea (también al bajar a 0), visible unos segundos, `role="status"`, abajo y centrado sin tapar controles.
- **Detalle `/catalogo/[id]`:**
  - Selector de cantidad (1 al stock de la talla elegida).
  - Botón principal `Agregar a la bolsa · $precio` (precio × cantidad). Estados: `Elige una talla` (deshabilitado sin talla), `Agotado` (deshabilitado). Al agregar se abre el cajón.
  - Botón `Preguntar por WhatsApp` (consulta de un solo producto, sin agregarlo a la bolsa).
- **Ajustes del catálogo** (`/admin/catalogo/ajustes`): dos campos nuevos, `Número de WhatsApp` y `Envío gratis desde`, que se guardan junto al título y la moneda.
- **Mensaje de WhatsApp** armado en el navegador y abierto con `https://wa.me/<número>?text=<mensaje codificado>` en una pestaña nueva.
- **Reconciliación al cargar:** la bolsa guardada se compara con el catálogo público vigente; las líneas de productos ocultos, borrados o con color/talla que ya no existen se quitan, y las cantidades se recortan al stock (si queda en 0, la línea se quita). Si algo cambió, se avisa una vez (`Actualizamos tu bolsa: algunos productos ya no están disponibles`).
- Sincronizar la bolsa entre pestañas con el evento `storage`.
- Actualizar `CLAUDE.md`.

**Fuera de alcance (specs futuros):**

- Checkout de tres pasos, datos de contacto, envío y pago, confirmación de pedido, número de pedido.
- Panel de pedidos y estados de pedido.
- Descuento de stock al enviar el pedido (el stock sigue siendo informativo).
- Costo de envío y su cálculo; la barra de envío gratis es solo un mensaje de progreso.
- Bolsa o botón de bolsa en la home `/` y en el panel.
- Candado de admin en el encabezado (decisión de la SPEC 07).
- Bolsa sincronizada entre dispositivos o ligada a una cuenta.
- Varios números de WhatsApp, mensaje editable por el admin, o WhatsApp Business API.
- Icono de WhatsApp en las redes de la home (se maneja ya con el catálogo de redes de la SPEC 03).

## Modelo de datos

**Catálogo** (`lib/catalog-shared.ts`, `lib/catalog.ts`). `Catalog` gana dos campos; no cambia la clave (`overcity:catalog:v2`) y los campos faltantes en lo guardado se rellenan con su valor por defecto al leer, como en la SPEC 05:

```ts
export type Catalog = {
  title: string;
  currency: CatalogCurrency;
  whatsapp: string; // solo dígitos con código de país, p. ej. "573001234567"; "" = sin configurar
  freeShippingFrom: number | null; // entero 1..MAX_PRICE en la moneda del catálogo; null = sin barra
  categories: CatalogCategory[];
  products: CatalogProduct[];
};
```

Reglas de validación en servidor:

- `whatsapp`: el formulario acepta `+57 300 123 4567`, espacios, guiones y paréntesis y los normaliza quitando todo lo que no sea dígito; el resultado debe ser `""` o de 8 a 15 dígitos (E.164). Cualquier otra cosa se rechaza con mensaje.
- `freeShippingFrom`: `null` o entero entre 1 y `MAX_PRICE`.
- Valor por defecto: `whatsapp: ""`, `freeShippingFrom: null`.
- El resto de reglas del catálogo no cambia.

**Bolsa** (solo cliente, nuevo `lib/cart.ts`, apto para el cliente, con funciones puras):

```ts
export type CartLine = {
  productId: string; // id del producto
  color: CatalogColor; // un color del producto
  size: string; // una clave de product.stock
  qty: number; // entero 1..stock de esa talla
};

// localStorage["overcity:cart:v1"] = JSON.stringify({ lines: CartLine[] })
```

Límites en `lib/content-limits.ts`: `MAX_CART_LINES = 30` (acota también el largo del enlace de WhatsApp). Agregar una línea 31 se rechaza con mensaje en el cajón. La cantidad máxima por línea es el stock de su talla (máx. `MAX_STOCK`).

Funciones en `lib/cart.ts`: `readCart`, `writeCart` (ambas con `try/catch`; sin `localStorage` la bolsa funciona solo en memoria), `reconcileCart(lines, catalog)`, `addLine`, `setQty`, `removeLine`, `cartCount`, `cartSubtotal(lines, catalog)`, `buildOrderMessage` y `buildInquiryMessage`, y `whatsappUrl(number, text)`.

**Formato del mensaje del pedido** (el origen del enlace sale de `window.location.origin` al hacer clic):

```
Hola {marca}, quiero hacer este pedido:

1. {nombre} — {color}, {talla} × {qty} — {total de línea | Consultar}
   {origen}/catalogo/{id}
2. …

Subtotal: {subtotal}
{Envío gratis incluido | }
```

`{marca}` es el nombre de marca de `SiteContent`. Si hay líneas sin precio, el subtotal lleva la nota `(sin contar los productos a consultar)`. El mensaje de consulta del detalle es: `Hola {marca}, quiero preguntar por {nombre}` más `Color: …` y `Talla: …` si ya están elegidos, y el enlace del producto.

**Datos hacia el cliente:** `store-shell.tsx` (servidor) pasa a un proveedor cliente un resumen compacto del catálogo público (id, nombre, precio, `categoryId`, colores, imágenes, stock) más `currency`, `whatsapp`, `freeShippingFrom` y el nombre de marca. El número de WhatsApp es público por naturaleza (va en el enlace `wa.me`).

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` las guías sobre componentes cliente dentro de layouts/páginas con `cacheComponents`, `"use cache"` y pasar props serializables de servidor a cliente (aviso de Next.js 16 del `CLAUDE.md`); revisar `app/_components/store-shell.tsx`, `app/catalogo/[id]/_components/product-detail.tsx`, `lib/catalog.ts`, `app/admin/catalogo/actions.ts` y la página de ajustes. Verificación: se sabe dónde montar el proveedor sin hacer dinámicas las rutas de la tienda.
2. Modelo y ajustes: agregar `whatsapp` y `freeShippingFrom` a `Catalog` con valores por defecto al leer, validación y normalización en `lib/catalog.ts`, y ampliar `saveCatalogSettings` y la pantalla `ajustes` (campo con ayuda `Con código de país, sin el +`, campo de umbral con el símbolo de la moneda, mensajes de error visibles). Verificación: `npm run lint` pasa; con un catálogo `v2` anterior las dos claves salen con su valor por defecto; guardar `+57 300 123 4567` guarda `573001234567`; `abc`, 7 dígitos, 16 dígitos y un umbral decimal o negativo se rechazan; sin sesión la acción se rechaza.
3. Lógica de la bolsa: `lib/cart.ts` y `MAX_CART_LINES` con sus funciones puras (lectura/escritura segura, agregar con tope por stock, reconciliar, subtotal, mensajes y URL de WhatsApp). Verificación: con casos manuales en consola/Node, una línea repetida suma cantidades sin pasar del stock, una línea con producto inexistente se descarta y el mensaje codifica tildes, saltos de línea y `&` correctamente.
4. Proveedor y estado de la bolsa: componente cliente (`app/_components/cart-provider.tsx`) montado desde `store-shell.tsx` con el resumen del catálogo; hidratación desde `localStorage` sin diferencias con el HTML del servidor, reconciliación al montar, sincronización por `storage` y estado de apertura del cajón. Verificación: recargar conserva la bolsa; ocultar un producto en el panel y recargar lo quita con el aviso; el build de `/catalogo` sigue estático.
5. Encabezado y cajón: botón de bolsa con contador en el encabezado de `store-shell.tsx` y `cart-drawer.tsx` (`<dialog>`) con cabecera, barra de envío gratis, líneas, estado vacío, pie y botón de WhatsApp. Verificación: abre y cierra con botón, Esc y fondo; el foco vuelve al botón; sin número el botón de envío está deshabilitado con el aviso `Pedidos por WhatsApp no disponibles por ahora`; con número abre `wa.me` con el mensaje esperado.
6. Aviso `Prenda quitada · Deshacer` (`cart-toast.tsx`): al quitar una línea o bajar a 0 aparece unos segundos y `Deshacer` la restaura en su lugar. Verificación: quitar y deshacer deja la bolsa igual; el aviso se anuncia con `role="status"` y no tapa el botón de envío a 360 px.
7. Detalle del producto: selector de cantidad, botón `Agregar a la bolsa · $precio` con sus estados y botón `Preguntar por WhatsApp` (oculto sin número). Verificación: cantidad topada al stock de la talla; cambiar de talla recorta la cantidad; agregar abre el cajón con la línea; una talla en 0 no se puede agregar; la consulta incluye color y talla solo si están elegidos.
8. Actualizar `CLAUDE.md` (campos nuevos del catálogo, clave de la bolsa, `lib/cart.ts`, proveedor y cajón, regla de capas con el cajón en `z-50`) y revisar `npm run build`, `npm run lint` y los 360 px de `/catalogo`, `/catalogo/[id]` con el cajón abierto y la pantalla de ajustes. Verificación: el texto coincide con el código y se cumplen los criterios de aceptación.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores, y `/catalogo` y `/catalogo/[id]` siguen sirviéndose desde caché (sin pasar a dinámicas).
- [ ] Un catálogo `v2` guardado antes de este spec carga sin errores con `whatsapp: ""` y `freeShippingFrom: null`.
- [ ] En `/admin/catalogo/ajustes` se guarda el número de WhatsApp: `+57 300 123 4567` queda como `573001234567`; un valor con letras o de menos de 8 o más de 15 dígitos se rechaza con mensaje; vacío lo deja sin configurar.
- [ ] El umbral de envío gratis acepta un entero positivo o vacío; decimales, ceros, negativos y valores sobre `MAX_PRICE` se rechazan en el servidor. Sin sesión, la acción se rechaza.
- [ ] El encabezado de la tienda muestra el botón de bolsa con el contador de unidades (oculto en 0); `/` y `/admin` no tienen botón de bolsa.
- [ ] En el detalle, `Agregar a la bolsa` está deshabilitado con `Elige una talla` hasta elegir una, y con `Agotado` si la talla no tiene stock; al agregar se abre el cajón con la línea.
- [ ] La cantidad del detalle y del cajón no supera el stock de la talla; agregar de nuevo la misma combinación producto + color + talla suma sin pasar del stock, y con 30 líneas la 31 se rechaza con mensaje.
- [ ] Líneas con distinto color o talla del mismo producto son líneas separadas.
- [ ] El cajón muestra miniatura del color elegido, nombre, `Color · Talla`, cantidad con `−` `+`, total de línea, `Quitar` y `Subtotal`; un producto sin precio muestra `Consultar` y no suma al subtotal.
- [ ] Con umbral definido, la barra muestra `Te faltan $X para envío gratis` y avanza con el subtotal, y con subtotal ≥ umbral dice `Tu envío es gratis`; sin umbral no hay barra.
- [ ] `Quitar` y bajar la cantidad a 0 muestran `Prenda quitada` y `Deshacer` restaura la línea; el aviso desaparece solo.
- [ ] Con número configurado, `Enviar pedido por WhatsApp` abre `wa.me/<número>` en una pestaña nueva con un mensaje que lista cada línea (nombre, color, talla, cantidad, total, enlace al producto) y el subtotal; tildes, saltos de línea y `&` llegan bien.
- [ ] Sin número configurado, la bolsa se puede armar, `Enviar pedido por WhatsApp` está deshabilitado con el aviso, y `Preguntar por WhatsApp` no aparece en el detalle.
- [ ] `Preguntar por WhatsApp` abre WhatsApp con nombre y enlace del producto, y color y talla solo si están elegidos; no modifica la bolsa.
- [ ] La bolsa persiste al recargar y se sincroniza entre pestañas; con `localStorage` bloqueado la tienda sigue funcionando y la bolsa dura mientras la pestaña esté abierta.
- [ ] Un producto ocultado, borrado o sin stock en esa talla desaparece de la bolsa al recargar con el aviso `Actualizamos tu bolsa…`; una cantidad mayor al stock se recorta.
- [ ] El cajón se cierra con `Cerrar`, Esc y clic en el fondo, atrapa el foco mientras está abierto y lo devuelve al botón de bolsa; con `prefers-reduced-motion: reduce` no se anima.
- [ ] Todo control de icono tiene `aria-label`; el contador de la bolsa se anuncia; todo se alcanza con Tab con foco visible.
- [ ] No hay scroll horizontal a 360 px en `/catalogo`, `/catalogo/[id]`, con el cajón abierto (con 30 líneas) ni en la pantalla de ajustes; el aviso no tapa el botón de envío.
- [ ] No se descuenta stock ni se guarda ningún pedido en Redis; las variables de entorno no cambian.

## Decisiones

- **Sí:** la bolsa vive en `localStorage` del visitante. No hay cuentas ni pedidos que guardar, no toca Redis ni la caché de la tienda y funciona sin servidor. Se reconcilia con el catálogo al cargar porque lo guardado puede quedar desactualizado.
- **No:** guardar la bolsa en cookie o en el servidor. Complicaría la caché de `/catalogo` y no aporta mientras no haya pedidos.
- **Sí:** el flujo termina en WhatsApp sin formulario previo. WhatsApp ya identifica al cliente por su número, y el checkout del diseño (contacto, envío, pago, pedidos) es otro spec con panel propio.
- **Sí:** el número de WhatsApp en `Catalog`, editable desde `Ajustes del catálogo`. Es un dato de la tienda, ya hay una pantalla para ello y no obliga a cambiar de clave ni a migrar. Se guarda solo con dígitos para armar `wa.me` sin sorpresas.
- **No:** ponerlo en `SiteContent` o en dos pantallas; un dato en dos lugares se desincroniza.
- **Sí:** barra de envío gratis con umbral editable (`freeShippingFrom`) en vez de un valor fijo, por la regla de contenido editable del panel. Es solo un mensaje: no hay costo de envío en el modelo.
- **Sí:** sin número, la bolsa se puede armar y el envío queda deshabilitado con aviso. El visitante no pierde su selección y el admin ve qué falta.
- **Sí:** tope de cantidad = stock de la talla, coherente con el tachado y `¡Quedan N!`. El stock no se descuenta porque no hay pedidos confirmados; descontarlo al abrir WhatsApp sería inventar una venta.
- **Sí:** `Preguntar por WhatsApp` incluye color y talla si ya están elegidos, sin exigirlos, para permitir consultas generales.
- **Sí:** el cajón es un `<dialog>` con `showModal`. Da Esc, foco atrapado y capa superior gratis, y sigue la regla de modales de la SPEC 04; se estiliza como cajón lateral del diseño.
- **Sí:** el cajón usa `z-50` como el diseño, por encima del encabezado fijo; lo documenta `CLAUDE.md` junto a la tabla de capas.
- **Sí:** `MAX_CART_LINES = 30` para acotar el largo del enlace de WhatsApp.
- **Sí:** el origen de los enlaces del mensaje sale de `window.location.origin` al hacer clic, para no depender de una variable de entorno nueva.
- **No:** icono de WhatsApp en la bolsa del encabezado ni cambios en la home; se mantiene el alcance en la tienda.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Leer `localStorage` al hidratar produce diferencias con el HTML del servidor | La bolsa se lee en un efecto tras montar; el primer render es sin bolsa (contador oculto). |
| `localStorage` bloqueado o lleno (modo privado) | `try/catch` en lectura y escritura; la bolsa funciona en memoria durante la sesión. |
| Pasar el catálogo al proveedor cliente infla el HTML de la tienda | Solo se envía un resumen (sin descripciones) de productos visibles, máximo 40. |
| Una bolsa vieja apunta a productos borrados u ocultos, o a stock que bajó | Reconciliación al cargar y al recibir `storage`, con aviso. |
| Un enlace `wa.me` demasiado largo falla | Tope de 30 líneas y mensaje compacto; se prueba con 30 líneas. |
| El admin escribe mal el número (sin código de país) y los pedidos llegan a otro lado | Ayuda visible en el campo y validación de longitud; no se puede verificar que el número exista. |
| Dos pedidos pueden pedir el último producto, porque el stock no se descuenta | Aceptado: es informativo hasta el spec de pedidos; la conversación en WhatsApp confirma disponibilidad. |
| El cajón o el aviso tapan controles a 360 px | El cajón ocupa `100%` de ancho, el aviso va sobre el borde inferior fuera del pie, y se comprueba en los criterios. |
| El HTML de referencia usa montos y textos de ejemplo (envío `$`, `Medellín`) | Solo se toman estructura y estilos; los textos salen del catálogo y de los ajustes. |

## Lo que **no** está en este spec

- Checkout, datos del cliente, pago y envío.
- Pedidos, panel de pedidos y estados.
- Descuento de stock y reservas.
- Costo de envío.
- Bolsa en la home o en el panel; candado de admin.
- Mensaje de WhatsApp editable, varios números, WhatsApp Business API.
- Bolsa entre dispositivos o con cuenta.

Cada uno, si se hace, va en su propio spec.
