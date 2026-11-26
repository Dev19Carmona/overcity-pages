# SPEC 17 — Gestión de pedidos: solicitudes de WhatsApp, congelamiento de inventario y venta

> **Estado:** Aprobado
> **Depende de:** SPEC 07, SPEC 08, SPEC 10, SPEC 12, SPEC 13 de este repo; SPEC 17, 18 y 19 de `base-template` (roles y permisos, vista de módulos y vista de aplicaciones cliente)
> **Contrato SSO:** `sso-v1` (sin cambios)
> **Fecha:** 2026-11-26
> **Objetivo:** Convertir lo que el cliente pide por WhatsApp en un pedido editable que puede congelar (reservar) inventario y venderse, descontando el stock en una sola transacción.

---

## Por qué existe este spec

Hoy la bolsa (SPEC 08) solo abre WhatsApp: no se guarda nada y el stock es informativo. El vendedor no tiene dónde registrar qué pidió cada cliente, qué cambió durante la conversación ni qué se vendió, y el inventario se corrige a mano en cada ficha. Dos clientes pueden recibir la promesa de la misma última unidad.

El pedido por WhatsApp se mantiene: el cliente puede comprar o no. Lo nuevo es que cada envío deja una **solicitud** con un código, el vendedor la convierte en **pedido**, puede **congelar** sus unidades mientras el cliente decide y **confirma la venta**.

Este spec cambia dos decisiones anteriores: el stock deja de ser solo informativo (SPEC 08 y SPEC 10) y la tienda pasa a mostrar el **disponible** (físico − reservado).

Antes de escribir código de Next.js lee `AGENTS.md` y la guía correspondiente en `node_modules/next/dist/docs/` (en especial caché con `cacheComponents`, `"use cache"`, `cacheLife`, Server Actions y `searchParams`). No leas ni edites `.env.local`.

---

## Alcance

**Dentro:**

- **Solicitud:** al pulsar `Enviar pedido por WhatsApp`, la tienda guarda la bolsa con un código corto que viaja en el mensaje. No pide datos al cliente ni toca el stock. Si guardar falla, WhatsApp se abre igual, sin código.
- **Panel `/admin/pedidos`** con dos pestañas: `Pedidos` y `Solicitudes` (convertir o descartar). Las solicitudes se borran a los 30 días.
- **Pedido:** crear desde una solicitud (precargado) o desde cero; editar (agregar y quitar líneas, cambiar cantidad, color, talla, diseño y precio); descuento, envío, datos del cliente y nota.
- Líneas **solo del catálogo** (producto + diseño + color + talla), incluidos los productos ocultos.
- **Congelar** el pedido completo (todo o nada) con un plazo elegido en ese momento; **Renovar** y **Liberar** a mano; vencimiento automático.
- **Vender**, con o sin congelamiento previo: descuento atómico del stock físico, método de pago, nota y comprobante opcional con foto cuando no es efectivo.
- **Anular** una venta completa con motivo: devuelve las unidades al stock en una sola transacción.
- **Cancelar** un pedido abierto.
- **Historial** de cada pedido (quién hizo qué y cuándo).
- La tienda, la ficha pública y la bolsa muestran el **disponible**.
- **Protección del stock en el catálogo:** no se puede guardar, quitar ni borrar nada que deje el stock por debajo de lo reservado.
- Módulo nuevo `pedidos` con los permisos `pedidos.pedidos.gestionar` y `pedidos.ventas.anular`, registrado en base-template.
- Actualizar `CLAUDE.md` de este repo y `base-template/clients/overcity.md` (commit aparte en ese repo).

**Fuera de alcance (specs futuros):**

- Pagos en línea, pasarelas, abonos, saldo pendiente o estado de pago.
- Devoluciones parciales y cambios de producto sobre una venta.
- Facturación electrónica, remisiones, recibos o PDF.
- Líneas libres (productos o servicios fuera del catálogo).
- Reportes, panel de ventas, exportación a Excel.
- Envíos: guías, transportadoras y estados de entrega.
- Fichero de clientes reutilizable (los datos viven en cada pedido).
- Integración con la API de WhatsApp, avisos de vencimiento y notificaciones.
- Comprobantes en PDF o varios por venta.
- Movimientos de inventario por otras causas (compras, ajustes, mermas, kárdex).
- Congelar línea por línea y congelamiento indefinido.
- Activar o desactivar la creación de solicitudes según los módulos activos de la empresa (depende de la adopción de la SPEC 20 de base-template en este repo).
- Cambios de código en base-template.

---

## Modelo de datos

Migración nueva `supabase/migrations/0002_orders.sql`, aplicada a mano en el SQL Editor y segura de volver a ejecutar. Las tablas siguen la regla de `0001`: RLS activado sin políticas, sin privilegios para `anon` ni `authenticated`, y funciones `security invoker` ejecutables solo por `service_role`.

### Tablas

```sql
order_requests (            -- solicitudes de la tienda; sin datos personales
  code text primary key,    -- 'OC-' + 5 caracteres de '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  lines jsonb not null,     -- [{ productId, designId, color, size, qty, productName, designName, unitPrice }]
  currency text not null,
  status text not null default 'pendiente',  -- 'pendiente' | 'convertida' | 'descartada'
  order_id text,
  created_at timestamptz not null default now()
)

orders (
  id text primary key,                                  -- crypto.randomUUID()
  number int generated always as identity unique,       -- se muestra como #0001
  status text not null default 'abierto',               -- 'abierto' | 'vendido' | 'cancelado' | 'anulado'
  frozen_until timestamptz,                             -- solo con status 'abierto'
  request_code text,                                    -- sin FK: la solicitud se borra a los 30 días
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_address text not null default '',            -- ciudad y dirección
  note text not null default '',
  currency text not null,                               -- copiada del catálogo al crear
  discount int not null default 0,
  shipping int not null default 0,
  payment_method text,   -- 'efectivo' | 'transferencia' | 'nequi_daviplata' | 'tarjeta' | 'contraentrega' | 'otro'
  payment_note text not null default '',
  proof_path text,                                      -- ruta en el bucket privado
  sold_at timestamptz,
  sold_by_name text,
  void_reason text,
  voided_at timestamptz,
  version int not null default 1,                       -- control optimista
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

order_items (
  order_id text not null references orders(id) on delete cascade,
  product_id text not null,   -- SIN FK al catálogo: save_product borra y recrea diseños y stock
  design_id text not null,
  color_name text not null,
  size text not null,
  qty int not null check (qty between 1 and 9999),
  unit_price int check (unit_price is null or unit_price between 0 and 999999999),
  product_name text not null, -- copias tomadas al agregar la línea
  design_name text not null,
  image_path text not null,
  position int not null,
  primary key (order_id, product_id, design_id, color_name, size)
)

order_events (
  id bigint generated always as identity primary key,
  order_id text not null references orders(id) on delete cascade,
  type text not null,  -- 'creado' | 'editado' | 'congelado' | 'renovado' | 'liberado' | 'vendido'
                       -- | 'cancelado' | 'anulado' | 'comprobante'
  actor_sub text not null,
  actor_name text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
)
```

Índices: `order_items (product_id, design_id, color_name, size)`, `orders (status, frozen_until)`, `orders (created_at desc)`, `order_requests (status, created_at desc)`.

### Reglas

- **No hay tabla de reservas.** Lo reservado de una combinación es la suma de `order_items.qty` de los pedidos con `status = 'abierto'` y `frozen_until > now()`. Se calcula con la función SQL `reserved_qty(product_id, design_id, color_name, size, excluding_order_id)`.
- **Disponible** = `greatest(stock físico − reservado, 0)`.
- **El vencimiento no necesita cron:** al pasar `frozen_until`, las unidades dejan de contar solas. El panel muestra `Congelamiento vencido` y el pedido sigue `abierto`. No se escribe evento de vencimiento.
- `Congelado` no es un estado guardado: es `abierto` con `frozen_until` en el futuro.
- Transiciones: `abierto → vendido`, `abierto → cancelado`, `vendido → anulado`. Ninguna otra. Solo un pedido `abierto` se edita. No se borran pedidos.
- Plazo: entero de 1 a 720 horas, precargado en 48, con accesos rápidos 24 h, 48 h, 72 h y 7 días. `Renovar` fija `frozen_until = now() + plazo` y vuelve a pedir el plazo.
- Subtotal = Σ `unit_price × qty`. Total = subtotal − descuento + envío. `0 ≤ descuento ≤ subtotal` (con líneas sin precio, el subtotal suma solo las que lo tienen); `0 ≤ envío ≤ MAX_PRICE`. Montos enteros. Si el catálogo tiene envío gratis y el subtotal lo alcanza, el panel lo avisa; el vendedor decide el valor.
- `unit_price` se copia del catálogo al agregar la línea y se puede editar; un cambio posterior en el catálogo no altera el pedido.
- Nombres e imagen de cada línea los copia el servidor desde el catálogo; **nunca se aceptan del navegador**. Las líneas que ya existen conservan sus copias.
- Datos del cliente opcionales mientras el pedido está `abierto`. Para vender son obligatorios nombre y teléfono, y todas las líneas deben tener precio.
- Un pedido tiene de 1 a `MAX_ORDER_LINES` (50) líneas. Agregar una combinación que ya está suma la cantidad.
- Un pedido **sin congelar** puede guardarse con cantidades mayores al disponible (se marca la línea con `Disponible: N`). Un pedido **congelado** no: cada edición se valida contra el disponible sin contar sus propias unidades, y se guarda todo o nada. Editar no cambia `frozen_until`.
- Editar un pedido con congelamiento vencido lo trata como no congelado.
- Una línea cuya combinación ya no existe en el catálogo se marca `Ya no existe en el catálogo`; bloquea congelar y vender hasta quitarla o cambiarla.

### Límites (`lib/content-limits.ts`)

`MAX_ORDER_LINES = 50`, `MAX_CUSTOMER_NAME = 80`, `MAX_CUSTOMER_PHONE = 20`, `MAX_CUSTOMER_ADDRESS = 200`, `MAX_ORDER_NOTE = 500`, `MAX_PAYMENT_NOTE = 200`, `MAX_VOID_REASON = 200`, `DEFAULT_FREEZE_HOURS = 48`, `MAX_FREEZE_HOURS = 720`, `REQUEST_TTL_DAYS = 30`, `MAX_PENDING_REQUESTS = 1000`, `REQUEST_RATE_LIMIT = 5` por IP cada 10 minutos, `MAX_PROOF_BYTES = 5 MB`.

### Funciones (RPC)

Cada una corre en una transacción y devuelve `{ ok, error?, version?, shortages? }`, donde `shortages` es `[{ productName, designName, color, size, requested, available }]`.

| Función | Hace |
|---|---|
| `create_order_request(payload)` | Purga solicitudes vencidas, comprueba el tope de pendientes e inserta. `code_taken` si el código ya existe (el servidor reintenta). |
| `discard_order_request(code)` | `pendiente → descartada`. |
| `save_order(payload, expected_version, actor)` | Crea o edita. Si `payload.requestCode` viene al crear, marca la solicitud como `convertida` en la misma transacción; si ya no está `pendiente`, falla con `request_unavailable`. |
| `freeze_order(id, hours, expected_version, actor)` | Congela o renueva, todo o nada. |
| `release_order(id, expected_version, actor)` | Pone `frozen_until` en nulo. |
| `cancel_order(id, expected_version, actor)` | `abierto → cancelado`. |
| `sell_order(id, payment, expected_version, actor)` | Venta atómica (abajo). |
| `void_order(id, reason, expected_version, actor)` | Anula y devuelve stock (abajo). |
| `set_order_proof(id, path, expected_version, actor)` | Adjunta o reemplaza el comprobante de una venta no anulada ni en efectivo; devuelve la ruta anterior. |

### Concurrencia y atomicidad (lo más crítico)

1. **Orden de bloqueo único:** primero la fila del pedido (`for update`), después las filas de `products` involucradas con `for update`, **ordenadas por `id`**. Toda función que aumente reservas o cambie stock sigue este orden: `save_order`, `freeze_order`, `sell_order`, `void_order`, `save_product`, `delete_product` y `save_categories`.
2. **Validar todo antes de escribir.** Devolver `{ ok: false }` desde plpgsql no revierte lo ya escrito: ninguna función escribe hasta que todas sus comprobaciones pasaron, y cualquier fallo posterior lanza una excepción.
3. **`sell_order`:** exige `abierto`, versión vigente, nombre, teléfono y todas las líneas con precio; comprueba que cada combinación exista y que `físico − reservado por otros ≥ qty`; descuenta `design_stock`; **incrementa `products.version`** de cada producto afectado; deja el pedido `vendido` con `frozen_until` nulo y escribe el evento. Un doble clic falla por estado o versión y nunca descuenta dos veces.
4. **Por qué se incrementa la versión del producto:** `save_product` borra y reescribe todo el stock. Sin el incremento, una ficha abierta antes de la venta restauraría las unidades vendidas. Con él, el guardado responde con el mensaje de conflicto ya existente.
5. **`void_order`:** suma las cantidades al stock (tope 9999), incrementa `products.version` y deja el pedido `anulado`. Las líneas cuya combinación ya no existe (producto, diseño, color o talla quitados) no se restauran: la anulación continúa, y esas líneas se muestran en el diálogo antes de confirmar y quedan en `order_events.detail`.

### Cambios a funciones existentes (en `0002`)

- `save_product`: antes de escribir, si para alguna combinación con reservas vigentes el stock nuevo es menor que lo reservado, o la combinación desaparece, devuelve `reserved_stock` con la lista de pedidos afectados.
- `delete_product`: rechaza con `reserved_stock` si el producto tiene reservas vigentes.
- `save_categories`: bloquea primero los productos afectados en orden de `id` y rechaza con `reserved_stock` si un cambio de `Talla única` o el borrado de una categoría haría desaparecer una talla reservada.
- `catalog_cards` y `catalog_products`: nuevo parámetro `discount_reserved boolean default false`. Con `true`, las cantidades y `stock_total` son el disponible. Se hace `drop function` de la firma anterior antes de crear la nueva, para no dejar dos sobrecargas, y se repiten los `revoke`/`grant`.
- Ocultar o mostrar un producto no se bloquea.

Mensaje de `reserved_stock`: `No se puede guardar: hay unidades reservadas en los pedidos #0012 y #0015. Libéralos o ajústalos primero.`

### Comprobantes de pago

- Bucket **privado** `payment-proofs` (5 MB, PNG/JPG/WebP, impuestos por el bucket). Sin políticas sobre `storage.objects`.
- `POST /api/order-proof` (permiso `pedidos.pedidos.gestionar`) recibe `{ orderId, contentType, size }` y devuelve una URL firmada de subida para `proofs/<orderId>/<uuid>.<ext>`, generada por el servidor.
- El servidor solo acepta una ruta del propio pedido y comprueba que el archivo exista antes de guardarla.
- Se ve con una URL firmada de descarga de 60 segundos, creada por una Server Action que exige permiso. La URL no se guarda ni se cachea.
- Solo existe si el método no es `efectivo`. Es opcional, se adjunta al vender o después, y se puede reemplazar (se borra el anterior). Una venta anulada conserva su comprobante y no admite cambios.

---

## Experiencia

### Tienda

- La bolsa envía las líneas a la Server Action pública `createOrderRequest`, que valida (máximo `MAX_CART_LINES`, solo productos visibles, combinaciones existentes, cantidades 1–9999), toma nombres y precios del catálogo en el servidor, aplica el límite por IP y devuelve el código.
- El mensaje agrega, tras el saludo, la línea `Código: OC-7K3F9`. El resto del formato de la SPEC 10 no cambia.
- **Nunca se bloquea una venta:** si falla, tarda más de 3 s, se supera el límite o hay demasiadas pendientes, WhatsApp se abre sin código y sin mostrar error.
- **Bloqueo de ventanas emergentes:** la pestaña se abre en el mismo gesto del clic (en blanco, con `opener = null`) y se redirige a `wa.me` al tener respuesta. Si `window.open` devuelve `null` (navegadores dentro de otras apps), se navega con `window.location.assign`.
- Mientras espera, el botón muestra `Abriendo WhatsApp…` y queda deshabilitado.
- Reenviar la misma bolsa sin cambios en la misma sesión del navegador reutiliza el código (`sessionStorage`).
- La IP se usa solo como huella (hash) en Redis con caducidad de 10 minutos; no se guarda en la solicitud. Sin Redis no hay solicitud y WhatsApp se abre sin código.
- `/catalogo`, `/catalogo/[id]` y `getCartProducts` usan el disponible. Una unidad congelada o vendida deja de ofrecerse y la reconciliación de la bolsa ya existente recorta o quita la línea.

### Caché pública

- `getPublicCatalogList` y `getPublicProduct` pasan de `cacheLife("hours")` a un perfil con `stale` 300 s, `revalidate` 60 s y `expire` 1 día (confirmar la sintaxis en la documentación de Next incluida).
- Toda acción que cambie reservas o stock llama a `updateTag("catalog")`.
- Un vencimiento no genera evento: la tienda puede tardar unos minutos en volver a mostrar esas unidades. La bolsa consulta sin caché y siempre ve el valor vigente.

### Panel

- Nuevo grupo `Ventas` en la barra lateral con `Pedidos`, visible con `pedidos.pedidos.gestionar`.
- `/admin/pedidos`:
  - Pestaña `Pedidos`: número, cliente, total, estado (`Abierto`, `Congelado · vence en 5 h`, `Congelamiento vencido`, `Vendido`, `Cancelado`, `Anulado`) y fecha. Filtro por estado, búsqueda por número, código, nombre o teléfono, 50 por página y botón `Nuevo pedido`.
  - Pestaña `Solicitudes`: código, fecha, resumen de líneas y subtotal, con `Convertir en pedido` y `Descartar`; búsqueda por código. Por defecto solo las `pendientes`.
- `/admin/pedidos/nuevo` (y `?solicitud=OC-7K3F9`) y `/admin/pedidos/[id]`:
  - Selector para agregar líneas: buscar producto (incluidos ocultos, marcados `Oculto`) → diseño → color → talla, mostrando físico y disponible.
  - Al convertir una solicitud el pedido **no se crea hasta pulsar `Guardar`**. Las combinaciones que ya no existen se excluyen y se listan en un aviso.
  - Los cambios son un borrador hasta `Guardar`. Congelar, vender y cancelar exigen no tener cambios sin guardar.
  - `Congelar` pide el plazo. Con el pedido congelado: `Renovar` y `Liberar`, y se muestra la fecha y hora de vencimiento (zona `America/Bogota`).
  - `Vender` abre un diálogo con el total, el método de pago, la nota y, si no es efectivo, el comprobante opcional. Si la subida falla, se puede vender sin él y adjuntarlo después.
  - `Cancelar pedido` pide confirmación.
  - Pedido `vendido`: solo lectura, comprobante y, con `pedidos.ventas.anular`, `Anular venta` con motivo obligatorio.
  - Historial al final.
  - Si faltan unidades, se muestra cada línea con lo pedido y lo disponible; nada se escribe.
  - Conflicto de versión: `Este pedido cambió desde que lo abriste. Recarga para ver la versión nueva.` El borrador queda en pantalla.
- La ficha de producto muestra junto a cada celda de stock `N reservadas` cuando las hay. La ficha y la lista del panel siguen mostrando el stock **físico**.
- Estilo según `CLAUDE.md`, sin scroll horizontal a 360 px y con `focus-visible` en todos los controles.

---

## Permisos y registro en base-template

| Módulo | Permiso | Da acceso a |
|---|---|---|
| `pedidos` | `pedidos.pedidos.gestionar` | `/admin/pedidos`, solicitudes, crear, editar, congelar, liberar, cancelar, vender, subir y ver comprobantes |
| `pedidos` | `pedidos.ventas.anular` | `Anular venta` |

- `pedidos.ventas.anular` es adicional: las pantallas exigen `pedidos.pedidos.gestionar`. Anular exige los dos.
- Cada Server Action, cargador y Route Handler comprueba su permiso. La única escritura pública es `createOrderRequest`.
- Quien solo tenga permisos de `pedidos` puede leer el catálogo desde el selector del pedido, pero no editarlo.
- Pasos en base-template (sin código, desde el panel de superadmin): registrar el módulo `pedidos` con sus dos permisos, activarlo para la empresa Overcity, añadirlo a `client_apps.moduleKeys` y asignar los permisos a los roles que correspondan (comprobar también el rol del propietario). Las sesiones abiertas reciben los permisos al renovar el token o al volver a entrar.

---

## Archivos

**Nuevos:** `supabase/migrations/0002_orders.sql`, `lib/orders-shared.ts` (tipos, totales y estado derivado; apto para cliente), `lib/orders-validate.ts`, `lib/orders.ts` (`server-only`), `app/_actions/order-request.ts`, `app/api/order-proof/route.ts`, `app/admin/pedidos/` (`page.tsx`, `[id]/page.tsx`, `actions.ts`, `_components/`), `scripts/verify-orders.ts`, `tests/orders.test.ts`, `tests/order-request.test.ts`.

**Modificados:** `lib/permissions.ts`, `lib/content-limits.ts`, `lib/supabase.ts` (nombre del bucket privado), `lib/catalog.ts` (disponible, caché, `reserved_stock`, fotos), `lib/cart.ts` (código en el mensaje), `app/_components/cart-drawer.tsx`, `app/admin/_components/admin-nav.tsx`, `app/admin/_lib.ts`, `app/admin/catalogo/_components/product-editor.tsx`, `tests/permissions.test.ts`, `tests/authorization.test.ts`, `CLAUDE.md`.

`deleteUnreferencedImages` pasa a conservar también las fotos referenciadas por `order_items.image_path`, para que el historial no quede sin miniaturas.

No hay variables de entorno nuevas.

---

## Plan de implementación

Cada paso deja el sistema funcionando.

1. Leer `AGENTS.md` y las guías de Next. En base-template, registrar el módulo `pedidos`, activarlo y asignar permisos. Añadir los dos permisos a `lib/permissions.ts` (al final de la lista, ambos con ruta `/admin/pedidos`) y actualizar las pruebas. Verificación: tras volver a entrar, la sesión trae los permisos; `npm test` pasa.
2. `0002_orders.sql`, primera parte: tablas, índices, RLS, `reserved_qty`, `save_order`, `release_order`, `cancel_order`. Aplicarla primero en un proyecto de Supabase que no sea producción. Verificación: se puede ejecutar dos veces sin error y `anon` no puede leer las tablas ni ejecutar las funciones.
3. `lib/orders-shared.ts`, `lib/orders-validate.ts`, `lib/orders.ts` y límites, con pruebas de totales, estado derivado y validaciones. Verificación: `npm test` pasa.
4. Panel básico: navegación, lista de pedidos, crear desde cero, editar y cancelar, con historial. Verificación: crear un pedido, quitar y agregar líneas, guardar, recargar y ver los mismos datos; el stock no cambia.
5. Congelamiento: `freeze_order`, validación de disponible en `save_order`, cambios en `save_product`, `delete_product` y `save_categories`, botones del panel y `N reservadas` en la ficha. Verificación: con 1 unidad, congelar el pedido A impide congelar el B; la ficha no deja bajar el stock a 0; al liberar, ambas cosas se permiten.
6. Disponible público: parámetro `discount_reserved`, lecturas de la tienda y la bolsa, perfil de caché. Verificación: una unidad congelada aparece agotada en la tienda y vuelve al liberarla; el panel del catálogo sigue mostrando el físico.
7. Venta y anulación: `sell_order`, `void_order` y sus diálogos, sin comprobante todavía. Verificación: vender descuenta exactamente las cantidades; una ficha abierta antes de la venta responde con conflicto; anular las devuelve.
8. Comprobantes: bucket privado, `/api/order-proof`, `set_order_proof`, subida, vista y reemplazo. Verificación: la URL pública del archivo no responde; la firmada sí y caduca.
9. Solicitudes: `create_order_request`, `discard_order_request`, Server Action pública con límites, cambios en la bolsa y el mensaje, pestaña `Solicitudes` y conversión. Verificación: en Android, iOS y el navegador dentro de Instagram, el botón abre WhatsApp con el código; con Supabase caído abre sin código.
10. `scripts/verify-orders.ts`: contra un proyecto de pruebas, crea sus propios datos, lanza operaciones simultáneas por RPC, comprueba los resultados y limpia. No corre sin `ORDERS_VERIFY_ALLOW=1`. Casos: dos ventas de la última unidad; dos congelamientos de la última unidad; venta doble del mismo pedido; venta y `save_product` a la vez; dos pedidos con los mismos productos en orden inverso (sin interbloqueo); venta de varias líneas con una sin stock (no se descuenta ninguna); venta de unidades reservadas por otro; congelamiento vencido que libera unidades. Verificación: todos pasan en varias ejecuciones seguidas.
11. Actualizar `CLAUDE.md` y `base-template/clients/overcity.md` (módulo, permisos y bucket). Ejecutar `npm test`, `npm run lint` y `npm run build`.

**Corte en producción:** aplicar `0002_orders.sql` **antes** de desplegar el código. La migración es compatible con el código anterior porque el parámetro nuevo tiene valor por defecto.

---

## Criterios de aceptación

**Solicitudes**

- [ ] Enviar la bolsa abre WhatsApp con `Código: OC-XXXXX` y crea una solicitud `pendiente` con las mismas líneas; el stock no cambia y no se pide ningún dato.
- [ ] Con Supabase o Redis caídos, límite superado, tope de pendientes o respuesta de más de 3 s, WhatsApp se abre sin código y sin error.
- [ ] Reenviar la misma bolsa en la misma sesión no crea otra solicitud.
- [ ] El servidor ignora nombres y precios enviados por el navegador y rechaza productos ocultos, más de 30 líneas y cantidades inválidas.
- [ ] Las solicitudes de más de 30 días se eliminan al crear o listar solicitudes; los pedidos creados desde ellas conservan el código.
- [ ] Convertir precarga las líneas, avisa de las excluidas y no crea nada hasta `Guardar`; una solicitud no se puede convertir dos veces.

**Pedidos y congelamiento**

- [ ] Se crea un pedido desde cero y desde una solicitud; se agregan y quitan líneas y se editan cantidades, precios, descuento, envío, cliente y nota, y todo persiste al recargar.
- [ ] El total es subtotal − descuento + envío; un descuento mayor que el subtotal se rechaza.
- [ ] Congelar exige un plazo de 1 a 720 horas (precargado 48) y es todo o nada: si falta una línea, no se reserva ninguna y se indica pedido y disponible.
- [ ] Con un pedido congelado, la tienda, la bolsa y los demás pedidos ven el disponible; el stock físico no cambia.
- [ ] Editar un pedido congelado ajusta la reserva en la misma operación, falla completo si no alcanza y no cambia el vencimiento.
- [ ] `Liberar` devuelve el disponible de inmediato; `Renovar` reinicia el plazo.
- [ ] Pasado el vencimiento, las unidades cuentan como disponibles sin ninguna acción y el pedido muestra `Congelamiento vencido`.
- [ ] La ficha, el borrado de productos y las categorías rechazan cambios que dejen el stock bajo lo reservado, nombrando los pedidos; ocultar un producto sí se permite.

**Venta y anulación**

- [ ] Se puede vender con o sin congelamiento previo; sin nombre, teléfono, método de pago o precio en todas las líneas, se rechaza.
- [ ] Vender descuenta exactamente cada cantidad y deja el pedido `vendido`; si una sola línea falla, no cambia ningún stock.
- [ ] No se pueden vender unidades reservadas por otro pedido vigente.
- [ ] Un doble clic o dos usuarios a la vez no descuentan dos veces.
- [ ] Una ficha de producto abierta antes de una venta no puede sobrescribir el stock: muestra el mensaje de conflicto.
- [ ] Un pedido `vendido`, `cancelado` o `anulado` no se puede editar.
- [ ] Anular exige `pedidos.ventas.anular` y motivo, devuelve las unidades una sola vez e informa las líneas que no se pudieron restaurar.
- [ ] Todos los casos de `scripts/verify-orders.ts` pasan.

**Comprobante**

- [ ] Solo aparece si el método no es efectivo; es opcional y se puede adjuntar al vender o después, y reemplazar.
- [ ] Solo admite una imagen PNG/JPG/WebP de hasta 5 MB.
- [ ] No es accesible por URL pública; la URL firmada exige permiso y caduca a los 60 s.
- [ ] Una venta anulada conserva el comprobante sin permitir cambios.

**Seguridad y general**

- [ ] Sin sesión, las acciones y rutas del panel responden 401; sin permiso, 403.
- [ ] `anon` y `authenticated` no pueden leer las tablas nuevas ni ejecutar las funciones nuevas.
- [ ] Cada cambio de un pedido deja un evento con el usuario y la fecha.
- [ ] No hay scroll horizontal a 360 px en `/admin/pedidos`, el pedido ni sus diálogos.
- [ ] `npm test`, `npm run lint` y `npm run build` terminan sin errores.

---

## Decisiones

- **Sí:** solicitud con código. El vendedor no vuelve a escribir el pedido y se evita interpretar texto libre. **No:** solo creación manual (lenta y con errores) ni pegar el mensaje (frágil si el cliente lo edita).
- **Sí:** solicitud y pedido son cosas distintas. La mayoría de envíos puede no terminar en compra y no debe ensuciar la lista de pedidos.
- **Sí:** congelar reserva y oculta en la tienda; el stock físico baja solo al vender. **No:** reservar solo en el panel (la tienda ofrecería lo apartado) ni descontar al congelar (confunde apartado con vendido).
- **Sí:** congelar el pedido completo. **No:** por línea, que multiplica estados.
- **Sí:** plazo elegido al congelar, precargado en 48 h, con vencimiento automático y liberación manual. **No:** indefinido (stock bloqueado por olvido) ni un ajuste configurable aparte.
- **Sí:** congelar es opcional antes de vender, porque hay clientes que pagan de inmediato.
- **Sí:** la reserva se deriva de `orders.frozen_until` y `order_items`. **No:** tabla de reservas ni cron, que añaden datos que pueden desincronizarse.
- **Sí:** reglas y atomicidad en funciones de Postgres, como el catálogo (SPEC 12). **No:** varias escrituras desde Next.js, que no son una transacción.
- **Sí:** bloquear los cambios de catálogo que rompan una reserva. **No:** permitirlos y marcar pedidos sin stock.
- **Sí:** subir la versión del producto al vender o anular, reutilizando el control optimista existente.
- **Sí:** las líneas guardan copias sin llave foránea al catálogo, porque `save_product` recrea los diseños y el historial debe sobrevivir al borrado de un producto.
- **Sí:** precio editable por línea, más descuento y envío por pedido.
- **Sí:** solo líneas del catálogo.
- **Sí:** anulación completa con motivo y permiso propio. **No:** devoluciones parciales (otro spec).
- **Sí:** la venta se da por pagada, con método y nota. **No:** abonos ni saldos.
- **Sí:** comprobante opcional, en bucket privado. **No:** el bucket público del catálogo ni PDF.
- **Sí:** dos permisos. **No:** uno solo (cualquiera reversaría ventas) ni separar vender de gestionar.
- **Sí:** módulo `pedidos` dentro de este proyecto (Modelo 1). Es el primer cliente: se construye a medida y se extrae a núcleo cuando una segunda empresa lo pida.
- **Sí:** nunca impedir el envío por WhatsApp por un fallo al registrar la solicitud.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Sobreventa o stock inconsistente por concurrencia | Bloqueo de filas en orden único, validación previa a escribir y `scripts/verify-orders.ts` |
| Interbloqueo entre operaciones sobre los mismos productos | Orden pedido → productos por `id` en todas las funciones; caso específico en el script |
| `move_product` actualiza posiciones sin seguir ese orden | Una transacción cancelada no deja datos a medias; el usuario reintenta |
| Spam en la única escritura pública | Límite por IP, tope de pendientes, validación en servidor y borrado a 30 días; si se satura, WhatsApp sigue funcionando sin código |
| Alguien congela o compra confiando en un código que el cliente alteró | El pedido sale de la solicitud guardada en el servidor, no del texto del chat; el vendedor confirma en la conversación |
| El navegador dentro de Instagram bloquea la ventana nueva | Apertura en el gesto del clic con respaldo en la misma pestaña; prueba manual en dispositivos reales |
| La tienda tarda en mostrar unidades tras un vencimiento | Caché con revalidación de 60 s; la bolsa consulta sin caché |
| Revalidar más seguido aumenta las consultas a Supabase | Solo las dos lecturas públicas y con `stale-while-revalidate`; revisar el consumo tras el corte |
| Datos personales y comprobantes (Ley 1581) | Datos mínimos y opcionales, acceso solo con permiso, bucket privado y nada de ello en logs. **Pendiente fuera de este spec:** política de retención y una forma de suprimir datos a solicitud del titular (hoy, a mano en Supabase) |
| Sin copia de seguridad, se pierde el registro de ventas | Antes del corte, confirmar qué copias de seguridad da el plan de Supabase |
| No hay un Supabase de pruebas para el script | Crear un proyecto aparte antes del paso 2; no ejecutar el script contra producción |
| Archivos huérfanos si se sube un comprobante y no se completa la venta | Se acepta; el bucket es privado y se limpia a mano |
| Volver a la versión anterior del código con pedidos congelados | La tienda y la ficha antiguas ignoran las reservas y el disponible vuelve a ser el físico; las ventas ya descontadas se mantienen |

---

## Lo que **no** está en este spec

Pagos en línea y abonos, devoluciones parciales, facturación electrónica y recibos, líneas libres, reportes y exportaciones, envíos, fichero de clientes, API de WhatsApp y notificaciones, otros movimientos de inventario, congelamiento por línea o indefinido y cambios de código en base-template.

Cada uno, si llega, va en su propio spec.
