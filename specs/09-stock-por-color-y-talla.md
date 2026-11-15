# SPEC 09 — Stock por color y talla en productos, detalle y bolsa

> **Estado:** Aprobado
> **Depende de:** SPEC 06, SPEC 07, SPEC 08
> **Fecha:** 2026-11-14
> **Objetivo:** Cambiar el stock de cada producto de "una cantidad por talla" a "una cantidad por color y talla", de modo que el panel, el detalle de la tienda y la bolsa trabajen con la existencia real de cada combinación.

## Por qué existe este spec

Hoy `CatalogProduct.stock` guarda un número por talla (`{ M: 5 }`) y es el mismo para todos los colores del producto. La bolsa (SPEC 08) ya separa las líneas por color y talla, pero el tope de cantidad sale del stock de la talla: si hay 5 unidades en talla M repartidas entre Negro y Blanco, el visitante puede pedir 5 en Negro aunque solo haya 2. El usuario pidió que las cantidades se elijan con base en el color y la talla, y que el stock se lleve por color y talla.

Es un cambio de estructura, no de comportamiento general: el producto sigue teniendo un precio, una descripción, colores de la paleta y fotos con color. No hay variantes con precio propio.

## Alcance

**Dentro:**

- **Stock por color y talla** en el modelo del producto: una cantidad para cada combinación de sus colores y de las tallas de su categoría.
- **Una sola versión del catálogo**, la clave `overcity:catalog:v2`. El stock con la forma anterior (un número por talla) se convierte en memoria al leer y el primer guardado escribe la forma nueva en esa misma clave.
- **Conversión del stock existente:** el stock de cada talla pasa al **primer color** del producto y los demás colores quedan en 0. El total no cambia.
- **Ficha de producto en el panel:** la sección `Stock por talla` pasa a `Stock por color y talla`, una tabla con una fila por color del producto y una celda por talla, con total por color y total general.
- **Detalle `/catalogo/[id]`:**
  - Las tallas se tachan según el stock del color elegido.
  - El mensaje (`Elige tu talla`, `¡Quedan N!` con 3 o menos, `Disponible`, `Agotado`) usa el stock de la combinación elegida.
  - Un color sin stock en ninguna talla se muestra tachado en el selector (sigue siendo elegible para ver sus fotos).
  - Al cambiar de color, si la talla elegida no tiene stock en el nuevo color, se deselecciona.
  - El color inicial es el primero con stock; si ninguno tiene, el primero.
  - La cantidad máxima es el stock de la combinación color + talla.
- **Bolsa:** el tope de cantidad de cada línea, la reconciliación al cargar y el selector `−` `+` del cajón usan el stock de color + talla. `CartLine` y la clave `overcity:cart:v1` no cambian.
- **Lista de productos del panel y tarjetas de la tienda:** el stock total suma todos los colores y tallas; `AGOTADO` aparece con total 0.
- **Cambios de categoría y de `Talla única`:** al cambiar las tallas de un producto, cada color conserva la lógica actual (apagar `Talla única` deja sus celdas en 0; encenderla suma las tallas de ese color).
- **Quitar o agregar un color** en la ficha quita o agrega su fila de stock (la nueva en 0).
- Validación en servidor de la forma nueva con mensajes visibles.
- Actualizar `CLAUDE.md` (modelo de stock, conversión, tope de la bolsa).

**Fuera de alcance (specs futuros):**

- Precio distinto por color o por talla, SKU o variantes con datos propios.
- Descuento de stock al enviar el pedido o reservas (el stock sigue siendo informativo, como en la SPEC 08).
- Alertas de stock bajo, historial de movimientos o carga masiva de stock (CSV).
- Colores o tallas personalizados.
- Cambiar el formato del mensaje de WhatsApp (ya lleva color y talla por línea).
- Quitar la lectura de `overcity:catalog:v1`.

## Modelo de datos

Tipos y helpers en `lib/catalog-shared.ts` (aptos para el cliente); validación, conversión y Redis en `lib/catalog.ts`.

```ts
export type CatalogProduct = {
  // …campos sin cambios (id, name, description, price, categoryId, visible, colors, images)
  // antes: stock: Record<string, number>          → una clave por talla
  stock: Record<string, Record<string, number>>;   // stock[color][talla]
};
```

Reglas del campo `stock`:

- Las claves del primer nivel son **exactamente** `product.colors`.
- Las claves del segundo nivel son **exactamente** `sizesFor(categoría del producto)`.
- Cada valor es un entero entre 0 y `MAX_STOCK` (9999).

Helpers puros en `lib/catalog-shared.ts`:

- `emptyStock(colors, sizes)`: tabla en 0.
- `stockOf(product, color, size)`: cantidad de una combinación; 0 si no existe.
- `colorStock(product, color)`: suma de las tallas de un color.
- `stockTotal(product)`: suma de todo; ya existe y pasa a sumar los dos niveles.
- `resizeStock(stock, colors, sizes, oneSizeChange?)`: ajusta la tabla cuando cambian colores o tallas, conservando lo que siga existiendo.

Persistencia y convenciones:

- Clave Redis `overcity:catalog:v2`. **No se crea una clave nueva.** Al leer, un producto cuyo `stock` tenga valores numéricos en el primer nivel (forma anterior) se convierte en memoria: el stock de cada talla va al primer color de `product.colors` y los demás colores quedan en 0. La detección es por producto.
- El primer guardado después de actualizar escribe la forma nueva en `v2`. Desde ese momento el código anterior no puede leer el stock por color; se acepta para un único administrador.
- La conversión `v1` → `v2` existente se adapta para que su resultado ya tenga la forma nueva (`colors: ["Negro"]`, `stock: { Negro: { …0 } }`). `v1` sigue sin modificarse.
- La tarjeta de resumen del catálogo que `store-shell.tsx` pasa al proveedor de la bolsa (`CartCatalog`) lleva el stock con la forma nueva.
- `localStorage["overcity:cart:v1"]` no cambia de forma ni de clave.
- Límites en `lib/content-limits.ts`: no cambian (`MAX_STOCK` = 9999, 6 colores × 5 tallas = 30 celdas por producto como máximo).
- Las variables de entorno no cambian.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` lo relacionado con `"use cache"` y props serializables hacia componentes cliente (aviso de Next.js 16 del `CLAUDE.md`) y revisar `lib/catalog-shared.ts`, `lib/catalog.ts`, `lib/cart.ts`, `app/_components/cart-provider.tsx`, `cart-drawer.tsx`, `app/catalogo/[id]/_components/product-detail.tsx`, `app/admin/catalogo/_components/product-editor.tsx` y `app/admin/catalogo/actions.ts`. Verificación: se tiene la lista de todos los sitios que leen `product.stock`.
2. Modelo y conversión: nueva forma de `stock` y helpers en `lib/catalog-shared.ts`; validación, conversión en memoria del stock anterior y adaptación de la conversión `v1` en `lib/catalog.ts`. Adaptar lo mínimo de las pantallas para que compilen. Verificación: `npm run lint` pasa; con un catálogo `v2` anterior, `/catalogo` muestra los mismos productos y el mismo total de stock (el stock de cada talla queda en el primer color); un stock que no coincide con los colores, con las tallas, negativo o decimal se rechaza en la validación.
3. Acciones del panel: `saveProduct`, `saveCategories` y `saveCatalogSettings` trabajan con la forma nueva; cambiar `oneSize` de una categoría reajusta el stock de todos sus productos por color. Verificación: sin sesión se rechazan; guardar un producto escribe `stock[color][talla]` en `v2`; encender y apagar `Talla única` ajusta las celdas como se describe en el alcance.
4. Ficha de producto: sección `Stock por color y talla` en `product-editor.tsx` (tabla con una fila por color, una celda por talla, total por color y total general); agregar y quitar colores y cambiar de categoría ajustan la tabla. Verificación: se crea un producto con 3 colores, se carga stock distinto en cada celda, se guarda, se recarga y queda igual; quitar un color elimina su fila y sus fotos pasan al primer color restante.
5. Lógica de la bolsa: `lib/cart.ts` (`addLine`, `setQty`, `reconcileCart` y el tope por línea) usa `stockOf(color, talla)`; `CartCatalog` y `cart-provider.tsx` pasan el stock nuevo. Verificación: con casos manuales en Node, agregar de nuevo la misma combinación suma sin pasar del stock de ese color, y una línea cuyo color ya no tiene stock en esa talla se quita al reconciliar.
6. Detalle y cajón: `product-detail.tsx` (tallas tachadas por color, color sin stock tachado, color inicial con stock, deselección al cambiar de color, mensaje y tope de cantidad por combinación) y el selector del cajón. Verificación: Negro con M en 2 y Blanco con M en 0: con Negro, M se elige y la cantidad llega a 2; al pasar a Blanco, M queda tachada y deseleccionada; el cajón no deja subir una línea de Negro M de 2.
7. Lista del panel, tarjetas y `CLAUDE.md`: confirmar que `stockTotal` suma los dos niveles en la lista de productos, las tarjetas y `AGOTADO`; actualizar `CLAUDE.md` (modelo de stock, conversión, tope de la bolsa); revisar `npm run build`, `npm run lint` y los 360 px de la ficha, el detalle y el cajón. Verificación: el texto coincide con el código y se cumplen los criterios de aceptación.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores, y `/catalogo` y `/catalogo/[id]` siguen sirviéndose desde caché.
- [ ] Un catálogo `v2` guardado antes de este spec carga sin errores: el stock de cada talla queda en el primer color del producto, los demás colores en 0, y el stock total de cada producto no cambia.
- [ ] La clave `overcity:catalog:v1` no se modifica, y no se crea ninguna clave nueva de catálogo; el primer guardado escribe la forma nueva en `overcity:catalog:v2`.
- [ ] En la ficha, la tabla de stock tiene una fila por color del producto y una columna por talla de su categoría (`XS`–`XL`, o `Única`); cambiar de categoría o el interruptor `Talla única` ajusta las columnas.
- [ ] Agregar un color agrega su fila en 0; quitar un color quita su fila y mueve sus fotos al primer color restante.
- [ ] Guardar y recargar un producto conserva cada celda de stock.
- [ ] El servidor rechaza un guardado con `stock` cuyos colores no coinciden con `colors`, cuyas tallas no coinciden con las de la categoría, o con valores negativos, decimales o mayores a `MAX_STOCK`. Sin sesión, la acción se rechaza.
- [ ] En `/catalogo/[id]`, al elegir un color las tallas se tachan y se deshabilitan según el stock de ese color; el mensaje (`Elige tu talla`, `¡Quedan N!` con 3 o menos, `Disponible`, `Agotado`) corresponde a color + talla.
- [ ] Un color sin stock en ninguna talla se muestra tachado en el selector y sigue pudiéndose elegir para ver sus fotos.
- [ ] Al cambiar a un color donde la talla elegida no tiene stock, la talla se deselecciona; el color inicial es el primero con stock (o el primero si ninguno tiene).
- [ ] La cantidad del detalle y del cajón no supera el stock de la combinación color + talla; agregar de nuevo la misma combinación suma sin pasarlo.
- [ ] Al cargar, una línea de la bolsa cuya combinación ya no tiene stock se quita con el aviso `Actualizamos tu bolsa…`, y una cantidad mayor al stock de esa combinación se recorta.
- [ ] La tarjeta muestra `AGOTADO` solo cuando el total de todos los colores y tallas es 0; la lista del panel muestra ese mismo total.
- [ ] Con una categoría que cambia de `Talla única`, el stock de cada producto se reajusta por color según la regla del alcance.
- [ ] No hay scroll horizontal a 360 px en la ficha con 6 colores × 5 tallas, en `/catalogo/[id]` ni en el cajón de la bolsa.
- [ ] No se descuenta stock ni se guarda ningún pedido; las variables de entorno no cambian.

## Decisiones

- **Sí:** una sola versión del catálogo (`overcity:catalog:v2`) con conversión en memoria del stock anterior. Es lo que pidió el usuario: no acumular claves ni código de conversión. La forma anterior es detectable por producto (valores numéricos en el primer nivel).
- **No:** clave nueva `v3`. Habría permitido volver atrás, pero deja claves y conversiones acumuladas, y con un único administrador el riesgo se acepta.
- **Sí:** el stock de cada talla pasa al primer color y los demás quedan en 0. No inventa unidades: el total no cambia. El admin reparte desde la ficha.
- **No:** copiar el stock a cada color (infla el total y permite vender lo que no existe) ni dejar todo en 0 (la tienda quedaría vacía tras actualizar).
- **Sí:** solo cambia el stock; el producto sigue teniendo un precio y una descripción. Las variantes con precio propio exigirían otro modelo, otro panel y otro mensaje de WhatsApp.
- **Sí:** disponibilidad cruzada en el detalle (tallas según el color elegido). Evita que el visitante elija combinaciones agotadas.
- **Sí:** un color sin stock queda elegible aunque esté tachado, para poder ver sus fotos; lo agotado no se oculta.
- **Sí:** al cambiar de color se deselecciona una talla sin stock en el nuevo color, en vez de dejar una combinación imposible seleccionada.
- **Sí:** el color inicial es el primero con stock, para que la primera vista no abra en un color agotado si otro tiene unidades.
- **Sí:** `CartLine` y `overcity:cart:v1` no cambian. La línea ya identifica color y talla; solo cambia de dónde sale el tope.
- **Sí:** el stock sigue siendo informativo y no se descuenta, como en la SPEC 08.
- **Sí:** se conserva la lectura de `v1`; quitarla es otro tema y no se pidió.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Después del primer guardado con la forma nueva, el código anterior no puede leer el stock por color | Aceptado para un único administrador; se documenta en `CLAUDE.md`. |
| Tras actualizar, los productos con varios colores muestran los otros colores agotados hasta repartir el stock | Aceptado: no se inventa stock. El total no cambia y se corrige desde la ficha. |
| Una bolsa guardada tiene líneas de colores que ahora están en 0 | La reconciliación al cargar quita la línea o recorta la cantidad y avisa. |
| Un producto con 6 colores × 5 tallas desborda la tabla a 360 px | Tabla con desplazamiento interno de la propia tabla y primera columna fija, sin scroll de la página; se comprueba en los criterios. |
| Apagar `Talla única` pone en 0 el stock de cada color (como hoy por talla) | Mensaje en el panel antes de confirmar el cambio. |
| Quitar un color por error pierde su stock | La ficha no publica nada hasta `Guardar`; `Descartar` restaura el borrador. |
| Una lectura con forma mixta (algunos productos con la forma vieja y otros con la nueva) | La detección es por producto, no global. |

## Lo que **no** está en este spec

- Precio, SKU o variantes propias por color o talla.
- Descuento de stock, reservas, alertas de stock bajo, historial o carga masiva.
- Colores o tallas personalizados.
- Cambios en el formato del mensaje de WhatsApp.
- Quitar la lectura de `overcity:catalog:v1`.

Cada uno, si se hace, va en su propio spec.
