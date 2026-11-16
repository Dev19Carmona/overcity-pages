# SPEC 11 — Gestión de colores del catálogo desde el panel

> **Estado:** Aprobado
> **Depende de:** SPEC 06, SPEC 07, SPEC 08, SPEC 09, SPEC 10
> **Fecha:** 2026-11-16
> **Objetivo:** Reemplazar la paleta fija de colores (`CATALOG_COLORS`) por una lista de colores propios del catálogo que el admin crea, edita, reordena, oculta y elimina desde `/admin/catalogo/colores`, y de la que eligen los diseños.

## Por qué existe este spec

Hoy los colores son seis nombres fijos en código (`Negro`, `Blanco`, `Rojo`, `Navy`, `Gris`, `Arena`) con su hex en `CATALOG_COLOR_HEX`. Para ofrecer un color nuevo (p. ej. `Verde militar`) hace falta tocar el código y desplegar. Las SPEC 09 y 10 dejaron «colores personalizados» como fuera de alcance; este spec lo cubre.

El nombre del color ya es la clave que usan los diseños (`design.colors`), el stock (`stock[color][talla]`), la bolsa (`CartLine.color`) y el mensaje de WhatsApp. Por eso el nombre pasa a ser el **identificador estable** del color y no se renombra: así no hay conversión de datos ni cascadas.

## Alcance

**Dentro:**

- **Lista de colores del catálogo** (`Catalog.colors`): cada color tiene `name`, `hex` y `hidden`. Máximo 24 colores.
- **Página `/admin/catalogo/colores`** dentro del layout de `/admin`, con entrada `Colores` en `AdminNav` bajo `Catálogo` (junto a `Categorías`). Permite:
  - crear un color (nombre + selector de color/hex);
  - cambiar el hex de un color existente;
  - reordenar con ↑ ↓ (el orden de la lista es el orden en que se ofrecen en el panel y en la tienda);
  - ocultar o mostrar un color (`hidden`);
  - eliminar un color con `<dialog>` de confirmación.
- **El nombre no se edita** una vez creado (es el identificador). Para «renombrar» se crea otro color y se elimina el viejo si no está en uso.
- **Eliminar se bloquea si el color está en uso:** si algún diseño de algún producto lo tiene, el botón `Eliminar` se deshabilita y el panel dice en cuántos diseños y productos está y sugiere `Ocultar`. El servidor también lo rechaza.
- **Ocultar:** un color oculto deja de aparecer en el selector de colores de la ficha para diseños nuevos o para agregarlo a un diseño; los diseños que ya lo tienen lo conservan, y en la tienda y la bolsa se ve igual que cualquier otro. Un color oculto sin uso se puede eliminar.
- **Semilla:** si el catálogo guardado no tiene `colors`, se rellena en memoria con los seis colores actuales (mismos nombres, mismos hex, `hidden: false`, en ese orden). El primer guardado escribe la lista. No hay conversión de productos, stock ni bolsa.
- **Ficha de producto** (`product-designs.tsx`): el selector de colores de cada diseño muestra los colores visibles de `catalog.colors` (más los ocultos que el diseño ya tiene), en el orden de la lista; el tope de 6 por diseño no cambia.
- **Tienda, bolsa y panel:** todos los sitios que hoy leen `CATALOG_COLOR_HEX[color]` pasan a buscar el hex en la lista del catálogo; `productColors(product)` ordena por la lista.
- **Validación en servidor** de la lista y de que cada color usado por un diseño exista en ella, con mensajes visibles.
- Actualizar `CLAUDE.md` (modelo de colores, semilla, regla de eliminación, límites).

**Fuera de alcance (specs futuros):**

- Renombrar un color con actualización en cascada de diseños, stock y bolsas.
- Más de un hex por color, degradados, estampados o fotos de muestra por color.
- Colores distintos por diseño con nombre propio (el nombre vive en el catálogo, no en el diseño).
- Subir o importar colores en lote (CSV, paletas).
- Tallas personalizadas.
- Cambiar el máximo de 6 colores por diseño.
- Cambiar la clave `overcity:cart:v1` o el formato del mensaje de WhatsApp.
- Quitar la lectura de `overcity:catalog:v1`.

## Modelo de datos

Tipos y helpers en `lib/catalog-shared.ts` (aptos para el cliente); validación, semilla y Redis en `lib/catalog.ts`.

```ts
// Antes: export const CATALOG_COLORS = ["Negro", …] as const; type CatalogColor = (typeof CATALOG_COLORS)[number];
export type CatalogColor = string;               // nombre de un color de Catalog.colors

export type CatalogColorDef = {
  name: string;     // 1..MAX_COLOR_NAME (24), identificador estable, único sin distinguir mayúsculas ni tildes
  hex: string;      // "#RRGGBB" (7 caracteres, mayúsculas o minúsculas)
  hidden: boolean;  // true: no se ofrece al elegir colores de un diseño
};

export type Catalog = {
  // …campos sin cambios (title, currency, whatsapp, freeShippingFrom, categories, products)
  colors: CatalogColorDef[];  // 0..MAX_COLORS (24); el orden es el orden de presentación
};

// Semilla (lo que hoy es CATALOG_COLORS + CATALOG_COLOR_HEX), exportada como DEFAULT_COLORS
```

Reglas de validación en servidor:

- `colors`: como máximo `MAX_COLORS` (24). Puede quedar vacía solo si ningún diseño usa colores, pero como todo diseño tiene 1–6 colores y hay al menos un diseño por producto, en la práctica con productos la lista no puede quedar vacía.
- `name`: texto sin espacios sobrantes, de 1 a `MAX_COLOR_NAME` (24) caracteres, sin repetidos comparando con `normalizeText` (sin mayúsculas ni tildes).
- `hex`: coincide con `/^#[0-9a-fA-F]{6}$/`.
- `hidden`: booleano.
- Cada color en `design.colors` existe en `catalog.colors` (por nombre exacto). Si no, se rechaza el guardado con mensaje.
- No se puede quitar de la lista un color usado por algún diseño.
- La regla de `design.colors` (1–6, sin repetir) y la de `stock` (claves de primer nivel exactamente `design.colors`) no cambian.

Helpers en `lib/catalog-shared.ts`:

- `DEFAULT_COLORS`: los seis colores actuales como `CatalogColorDef[]`.
- `colorHex(colors, name)`: hex de un color; un gris neutro `#808080` si el nombre no existe (solo para no romper el render; la validación impide llegar ahí).
- `productColors(product, colors)`: unión de los colores de sus diseños, ordenada según `colors` (cambia de firma para recibir la lista).
- `colorUsage(catalog, name)`: `{ designs: number, products: number }` de uso de un color.
- `normalizeText` ya existe y se reutiliza para la unicidad.

Persistencia y convenciones:

- Clave Redis `overcity:catalog:v2`, etiqueta de caché `catalog`. **No se crea clave nueva.** Un catálogo guardado sin `colors` se lee con `DEFAULT_COLORS` en memoria y el primer guardado (de cualquier tipo) la escribe. La lectura de `overcity:catalog:v1` sigue convirtiéndose en memoria y recibe la misma semilla; `v1` no se modifica.
- Los nombres de la semilla son los mismos que ya usan los diseños, el stock y las bolsas guardadas, por lo que nada guardado se invalida.
- `CartCatalog` (resumen para el proveedor de la bolsa) lleva `colors` (`name` y `hex`) para pintar las miniaturas de línea sin importar constantes.
- Los componentes de tienda reciben la lista de colores como prop serializable desde el servidor (en el mismo patrón que ya reciben el catálogo).
- `localStorage["overcity:cart:v1"]` no cambia de forma ni de clave: `CartLine.color` sigue siendo el nombre.
- Server actions en `app/admin/catalogo/actions.ts`: nueva `saveColors(colors)` que exige sesión, lee el catálogo guardado, valida la lista completa y el uso por diseños, escribe Redis y llama a `updateTag("catalog")`. `saveProduct` valida contra la lista guardada.
- Límites en `lib/content-limits.ts`: nuevas `MAX_COLORS = 24` y `MAX_COLOR_NAME = 24`; `MAX_DESIGN_COLORS` (6) se conserva.
- Las variables de entorno no cambian.

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` lo relacionado con `"use cache"` y props serializables hacia componentes cliente (aviso de Next.js 16 del `CLAUDE.md`) y listar todos los sitios que importan `CATALOG_COLORS`, `CATALOG_COLOR_HEX` o `productColors`: `lib/catalog-shared.ts`, `lib/catalog.ts`, `lib/cart.ts`, `app/admin/_components/ui.tsx`, `app/_components/cart-drawer.tsx`, `cart-provider.tsx`, `store-shell.tsx`, `app/catalogo/[id]/_components/product-detail.tsx`, `app/catalogo/_components/catalog-browser.tsx`, `app/admin/catalogo/_components/products-admin.tsx`, `product-editor.tsx` y `product-designs.tsx`. Verificación: se tiene la lista completa de sitios.
2. Modelo y semilla: `CatalogColorDef`, `DEFAULT_COLORS`, `colorHex`, `colorUsage`, `productColors(product, colors)` y límites en `lib/catalog-shared.ts` y `lib/content-limits.ts`; `Catalog.colors`, validación, lectura con semilla y conversión `v1` en `lib/catalog.ts`. Adaptar lo mínimo de las pantallas para que compilen (los sitios leen el hex de la lista). Verificación: `npm run lint` pasa; con un catálogo `v2` guardado sin `colors`, `/catalogo` y `/catalogo/[id]` se ven igual que antes; un nombre vacío o repetido (sin mayúsculas ni tildes), un hex inválido, más de 24 colores o un diseño con un color que no está en la lista se rechazan en la validación.
3. Acción `saveColors` y reglas de uso: crear, cambiar hex, reordenar, ocultar y eliminar; el servidor rechaza eliminar un color en uso o dejar un diseño con un color inexistente; `saveProduct` valida contra la lista. Verificación: sin sesión se rechaza; guardar una lista nueva escribe `colors` en `overcity:catalog:v2`; eliminar un color usado devuelve el error con el conteo; eliminar uno sin uso funciona.
4. Página `/admin/catalogo/colores` y entrada `Colores` en `AdminNav`: lista con muestra del color, nombre, hex editable, ↑ ↓, interruptor `Oculto`, uso (`En N diseños`), `Eliminar` deshabilitado si está en uso, formulario de creación con selector de color y campo hex, `<dialog>` de confirmación y mensajes de error. Verificación: se crea `Verde militar` `#4B5320`, se recarga y aparece; se reordena; un color en uso muestra su conteo y no se puede eliminar; un nombre repetido (p. ej. `negro`) se rechaza con mensaje.
5. Ficha de producto: `product-designs.tsx` y `product-editor.tsx` usan `catalog.colors` (visibles más los que el diseño ya tiene, en orden de la lista), puntos de color con el hex de la lista, tope de 6 por diseño. Verificación: en un diseño se elige `Verde militar`, se carga stock, se guarda y se recarga; un color oculto no aparece para otro diseño pero el diseño que lo tenía lo conserva; con 6 colores elegidos no se ofrece un séptimo.
6. Tienda y bolsa: `store-shell.tsx`, `cart-provider.tsx`, `cart-drawer.tsx`, `product-detail.tsx`, `catalog-browser.tsx`, `products-admin.tsx` y `lib/cart.ts` leen el hex de la lista; `CartCatalog` lleva `colors`; `CartLine.color` sigue siendo el nombre. Verificación: el detalle muestra el color nuevo con su hex; agregar a la bolsa y abrir WhatsApp muestra `Verde militar` en la línea; una bolsa guardada con `Negro` sigue reconciliando igual.
7. `CLAUDE.md` y cierre: documentar el modelo de colores, la semilla, la regla de eliminación y los límites; revisar `npm run build`, `npm run lint` y los 360 px de la página de colores y de la ficha. Verificación: el texto coincide con el código y se cumplen los criterios de aceptación.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores, y `/catalogo` y `/catalogo/[id]` siguen sirviéndose desde caché.
- [ ] Un catálogo `v2` guardado antes de este spec carga sin errores con los seis colores actuales como lista inicial (mismos nombres y hex), y productos, stock y bolsas guardadas no cambian.
- [ ] No se crea ninguna clave nueva de catálogo y `overcity:catalog:v1` no se modifica; el primer guardado escribe `colors` en `overcity:catalog:v2`.
- [ ] `/admin/catalogo/colores` existe, aparece como `Colores` en el menú `Catálogo` y exige sesión como las demás páginas del panel.
- [ ] Se puede crear un color con nombre y hex, cambiar su hex, reordenarlo con ↑ ↓, ocultarlo y mostrarlo; al recargar todo queda igual.
- [ ] El nombre de un color existente no se puede editar.
- [ ] El servidor rechaza, con mensaje visible: nombre vacío, de más de 24 caracteres o repetido (sin distinguir mayúsculas ni tildes), hex que no sea `#RRGGBB`, más de 24 colores, y un diseño con un color que no existe en la lista. Sin sesión la acción se rechaza.
- [ ] Un color usado por algún diseño no se puede eliminar: el botón está deshabilitado, el panel muestra en cuántos diseños y productos está, y el servidor lo rechaza si se fuerza.
- [ ] Un color sin uso se puede eliminar tras confirmar en el `<dialog>`; un color oculto sin uso también.
- [ ] En la ficha, el selector de colores de un diseño ofrece los colores visibles en el orden de la lista, más los ocultos que el diseño ya tenga; un color oculto no se ofrece a otros diseños; el máximo de 6 por diseño se mantiene.
- [ ] Un color nuevo elegido en un diseño con stock se ve en `/catalogo/[id]` con su hex, se puede agregar a la bolsa y aparece con su nombre en el mensaje de WhatsApp.
- [ ] Una línea de bolsa guardada con un color de la semilla (p. ej. `Negro`) sigue siendo válida tras la actualización.
- [ ] Las miniaturas de línea, tarjetas y puntos de color usan el hex de la lista del catálogo; no queda ninguna importación de `CATALOG_COLORS` ni `CATALOG_COLOR_HEX`.
- [ ] No hay scroll horizontal a 360 px en `/admin/catalogo/colores` con 24 colores ni en la ficha de producto.
- [ ] Las variables de entorno y la clave `overcity:cart:v1` no cambian.

## Decisiones

- **Sí:** colores propios del catálogo gestionados desde el panel. Es lo que pidió el usuario y cierra el «colores personalizados» que las SPEC 09 y 10 dejaron fuera.
- **No:** solo ocultar o reordenar la paleta fija. No permitía agregar colores sin tocar el código.
- **No:** colores libres por diseño sin lista central. Daría nombres inconsistentes (`Negro`, `negro`) y complicaría stock y mensajes.
- **Sí:** la lista vive dentro del catálogo (`Catalog.colors` en `overcity:catalog:v2`) con una página nueva en el panel, igual que las categorías. Una clave aparte exigiría mantener dos claves consistentes y otra etiqueta de caché.
- **No:** clave Redis nueva para los colores. Mismo criterio de una sola clave que las SPEC 09 y 10.
- **Sí:** el nombre es el identificador estable y no se edita. Ya es la clave en `design.colors`, `stock`, `CartLine.color` y el mensaje de WhatsApp; no editarlo evita migrar datos y bolsas guardadas.
- **No:** renombrar con cascada. Tocaría diseños, stock y las bolsas que cada visitante guarda en su navegador, que no se pueden migrar desde el servidor.
- **Sí:** eliminar se bloquea si el color está en uso y se ofrece `Ocultar` como alternativa. Evita perder stock y líneas de bolsa por un clic.
- **No:** eliminar en cascada y **no** «solo ocultar, nunca eliminar»: lo primero pierde datos; lo segundo deja la lista creciendo sin salida hasta el tope de 24.
- **Sí:** un color oculto se conserva en los diseños que ya lo tienen. Ocultar solo afecta a lo que se ofrece al elegir.
- **Sí:** semilla en memoria con los seis colores actuales y los mismos nombres. Nada guardado cambia ni se rompe.
- **No:** empezar vacío. Dejaría productos con colores huérfanos que habría que reasignar a mano.
- **Sí:** tope de 24 colores en total y 24 caracteres por nombre. Mantiene la página y el selector manejables sin sentirse restrictivo.
- **Sí:** el máximo de 6 colores por diseño no cambia; la lista global y el tope por diseño son límites distintos.
- **Sí:** un solo `hex` sólido por color. Degradados o muestras con foto serían otro spec.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Un color en uso se elimina por una condición de carrera o con una petición manual | El servidor recalcula el uso al guardar y rechaza; no se confía en el estado del cliente. |
| Un nombre con mayúsculas o tildes distintas se cuela como duplicado (`Negro` / `negro`) | Unicidad con `normalizeText` en el servidor y mensaje claro en el panel. |
| Una bolsa guardada contiene un color que luego se elimina | Solo se puede eliminar un color sin uso en diseños; aun así `reconcileCart` ya quita líneas cuyo color no existe en el diseño. |
| Un hex con poco contraste hace invisible el punto de color sobre el fondo marino | El punto de color lleva borde `rgba(255,255,255,.1)` como ahora; el nombre siempre acompaña o es etiqueta accesible. |
| La lista de 24 colores desborda a 360 px | Filas apiladas en móvil, sin tablas anchas; se comprueba en los criterios. |
| Una lectura de catálogo anterior sin `colors` mezcla formas | La semilla se aplica al leer cuando falta el campo, por catálogo completo. |
| Tras el primer guardado, el código anterior no entiende `colors` y los hex vuelven a la paleta fija | Aceptado para un único administrador; se documenta en `CLAUDE.md`. |

## Lo que **no** está en este spec

- Renombrar colores con cascada.
- Degradados, estampados, fotos de muestra o varios hex por color.
- Nombre de color propio por diseño.
- Importación en lote de colores.
- Tallas personalizadas.
- Cambiar el máximo de 6 colores por diseño.
- Cambios en `overcity:cart:v1` o en el formato del mensaje de WhatsApp.
- Quitar la lectura de `overcity:catalog:v1`.

Cada uno, si se hace, va en su propio spec.
