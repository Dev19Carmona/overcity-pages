# SPEC 12 — Catálogo en Supabase (Postgres y Storage) y límites mayores

> **Estado:** Aprobado
> **Depende de:** SPEC 05, SPEC 06, SPEC 07, SPEC 08, SPEC 09, SPEC 10, SPEC 11
> **Fecha:** 2026-11-16
> **Objetivo:** Mover el catálogo de Redis y de las fotos de Vercel Blob a Supabase (tablas relacionales en Postgres y Storage) sin cambiar lo que ven la tienda y el panel, y subir los límites de productos, categorías, diseños, colores e imágenes.

## Por qué existe este spec

Hoy el catálogo es un único documento JSON en `overcity:catalog:v2`: cada guardado lee todo, lo modifica y lo reescribe. Con 40 productos funciona, pero el proyecto va a crecer y ese modelo no escala: dos administradores se pisan, no hay consultas ni integridad (un color en uso se protege solo por código) y el stock no puede evolucionar a descuento atómico cuando existan pedidos.

Este spec cambia **dónde viven los datos del catálogo y sus fotos**, y sube los topes que existen por el tamaño del documento. No cambia el diseño, el flujo de compra por WhatsApp ni el modelo de producto → diseño → color → talla de las SPEC 09–11.

## Alcance

**Dentro:**

- **Postgres en Supabase** como única fuente del catálogo, con tablas relacionales: `catalog_settings`, `categories`, `colors`, `products`, `designs`, `design_colors` y `design_stock`. El esquema vive en `supabase/migrations/0001_catalog.sql` (se aplica a mano en el SQL Editor de Supabase).
- **Supabase Storage** para las fotos de diseños: bucket público de lectura `catalog`, escritura solo desde el servidor. Límite de 5 MB y tipos PNG/JPG/WebP impuestos por la configuración del bucket.
- **Acceso solo desde el servidor** con `SUPABASE_SERVICE_ROLE_KEY`. RLS activado en todas las tablas y sin políticas públicas; el navegador nunca habla con Supabase salvo para subir una foto con una URL firmada que entrega el servidor.
- **Límites nuevos** (escala media): 500 productos, 50 categorías, 20 diseños por producto, 60 colores en el catálogo, 10 colores por diseño y 5 MB por imagen.
- **Escrituras por entidad y transaccionales** mediante funciones SQL (RPC): guardar un producto solo reescribe ese producto con sus diseños, colores y stock en una transacción.
- **Control optimista en productos:** cada producto lleva `version`; el guardado de la ficha se rechaza con mensaje claro si el producto cambió desde que se abrió.
- **Lecturas ligeras:** la tienda y las listas del panel dejan de cargar el catálogo completo con todas las matrices de stock. La lista pública y la del panel traen solo lo que muestran; el detalle y la ficha leen un producto.
- **Bolsa a escala:** el proveedor de la bolsa deja de recibir el resumen de todo el catálogo; reconcilia pidiendo al servidor solo los productos que hay en la bolsa (máximo 30 líneas).
- **Script de migración de una sola vez** (`scripts/migrate-catalog-to-supabase.ts`): lee `overcity:catalog:v2` de Redis (con las conversiones `v1`, SPEC 09, 10 y 11 que ya existen), copia las fotos de Blob a Storage, inserta en Postgres y es idempotente. No modifica ni borra nada en Redis ni en Blob.
- **Corte en producción** con rollback posible (los datos viejos quedan intactos).
- Actualizar `CLAUDE.md`, `.env.example` y los límites.

**Fuera de alcance (specs futuros):**

- Pedidos guardados, checkout, descuento atómico de stock, reservas o panel de pedidos. El stock sigue siendo informativo; este spec solo deja la base lista.
- Mover `SiteContent` (página de links, redes, fondo, música, logo) a Supabase. Sigue en Redis y sus archivos siguen en Vercel Blob (`/api/logo`, `/api/media` con `background/` y `music/`).
- Sesión de admin y límite de intentos de login (`lib/auth.ts`, Redis): no cambian. No se usa Supabase Auth.
- Clientes con cuenta, varios administradores o roles.
- Búsqueda, filtros y paginación en servidor: la búsqueda de `/catalogo` sigue siendo en el cliente sobre la lista ligera.
- Borrar las claves `overcity:catalog:*` de Redis y las fotos `catalog/` de Blob (limpieza en un spec posterior, una vez estable).
- Redimensionar o transformar imágenes, o varias fotos por diseño.
- Cambiar precio, tallas, el máximo de 30 líneas de bolsa, el formato del mensaje de WhatsApp o la clave `overcity:cart:v1`.
- Realtime, backups programados o réplicas de Supabase.

## Modelo de datos

Los tipos TypeScript del catálogo (`Catalog`, `CatalogProduct`, `CatalogDesign`, `CatalogColorDef`, `Category`) **conservan su forma** en `lib/catalog-shared.ts`; cambia dónde se guardan. Se agregan tipos ligeros para las lecturas nuevas (ver más abajo).

### Esquema SQL (`supabase/migrations/0001_catalog.sql`)

```sql
create table catalog_settings (
  id int primary key default 1 check (id = 1),     -- una sola fila
  title text not null,
  currency text not null,
  whatsapp text not null default '',               -- solo dígitos con prefijo, '' = sin configurar
  free_shipping_from integer
);

create table categories (
  id text primary key,                             -- mismos ids actuales (crypto.randomUUID)
  name text not null,
  one_size boolean not null default false,
  position integer not null
);

create table colors (
  name text primary key,                           -- identificador estable (SPEC 11)
  name_key text not null unique,                   -- nombre sin mayúsculas ni tildes
  hex text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
  hidden boolean not null default false,
  position integer not null
);

create table products (
  id text primary key,
  name text not null,
  description text not null default '',
  price integer check (price is null or price between 0 and 999999999),
  category_id text references categories(id) on delete set null,
  visible boolean not null default true,
  position integer not null,
  version integer not null default 1,              -- control optimista
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table designs (
  product_id text not null references products(id) on delete cascade,
  id text not null,                                -- estable dentro del producto
  name text not null,
  name_key text not null,
  image_path text not null,                        -- ruta en el bucket `catalog`, no la URL completa
  position integer not null,
  primary key (product_id, id),
  unique (product_id, name_key)                    -- nombre único por producto (SPEC 10)
);

create table design_colors (
  product_id text not null,
  design_id text not null,
  color_name text not null references colors(name) on delete restrict,  -- un color en uso no se borra
  position integer not null,
  primary key (product_id, design_id, color_name),
  foreign key (product_id, design_id) references designs(product_id, id) on delete cascade
);

create table design_stock (
  product_id text not null,
  design_id text not null,
  color_name text not null,
  size text not null,                              -- XS..XL o 'Única'
  qty integer not null check (qty between 0 and 9999),
  primary key (product_id, design_id, color_name, size),
  foreign key (product_id, design_id, color_name)
    references design_colors(product_id, design_id, color_name) on delete cascade
);

-- RLS activado en todas las tablas, sin políticas: solo el service role accede.
```

- `designs.image_path` guarda la ruta (`catalog/<uuid>.<ext>`) y la URL pública se arma al leer con `SUPABASE_URL`. Así un cambio de proyecto no obliga a reescribir filas.
- Los ids de producto, categoría y diseño son `text` y se conservan tal cual (incluidos los `diseno-N` que dejó la conversión de la SPEC 10). Los ids nuevos se siguen generando con `crypto.randomUUID()`.
- Los valores válidos de `size` y la regla «las tallas de un color son exactamente `sizesFor(categoría)`» se siguen validando en TypeScript; la base garantiza integridad referencial, rangos y unicidad.

### Funciones SQL (RPC, todas `security invoker`, llamadas solo con service role)

Cada una corre en una transacción y devuelve `{ ok, error, version? }`:

- `save_product(payload jsonb, expected_version int)`: crea (`expected_version` nulo) o actualiza el producto, reemplaza sus diseños, colores y stock, incrementa `version`. Si la `version` guardada no coincide, devuelve `error = 'conflict'` y no escribe.
- `delete_product(id text)`, `set_product_visible(id text, visible boolean)` (incrementa `version`) y `move_product(id text, offset int)` (intercambia `position`; no incrementa `version`).
- `save_categories(items jsonb)`: sincroniza la lista (crea, renombra, reordena, borra; los productos de una categoría borrada se tratan como hoy). Si cambia `one_size`, reajusta en la misma transacción el stock de los productos afectados con la lógica actual de `resizeStock` (encender suma las tallas del color en `Única`; apagar deja las celdas en 0) e incrementa su `version`.
- `save_colors(items jsonb)`: sincroniza la lista; el borrado de un color en uso falla por la FK y se traduce al mensaje con conteo de la SPEC 11.
- `save_settings(payload jsonb)`.

### Tipos de lectura ligeros (`lib/catalog-shared.ts`)

```ts
// Tarjeta de la tienda y fila de la lista del panel: sin descripción ni matriz de stock.
export type ProductCard = {
  id: string; name: string; price: number | null; categoryId: string | null;
  cover: string;            // URL pública de la foto del primer diseño
  colors: CatalogColor[];   // unión de colores de los diseños, en orden de la lista
  stockTotal: number;       // calculado en la consulta
  visible: boolean;
};

export type CatalogList = {
  title: string; currency: string; whatsapp: string; freeShippingFrom: number | null;
  categories: Category[]; colors: CatalogColorDef[]; products: ProductCard[];
};
```

El detalle (`getPublicProduct(id)`) y la ficha del panel (`getAdminProduct(id)`) devuelven un `CatalogProduct` completo más su `version`.

### Persistencia y convenciones

- Funciones de datos en `lib/catalog.ts` (server-only): `getPublicCatalogList()` y `getPublicProduct(id)` con `"use cache"` y etiqueta `catalog` (solo productos visibles); `getAdminCatalogList()`, `getAdminProduct(id)`, `getAdminCategories()`, `getAdminColors()`, `getAdminSettings()` sin caché; escritura mediante las RPC. `lib/supabase.ts` (server-only) crea el cliente con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
- La validación en TypeScript se reparte por entidad (`validateProduct`, `validateCategories`, `validateColors`, `validateSettings`); las acciones de `app/admin/catalogo/actions.ts` mantienen sus nombres y firmas, salvo `saveProduct(product, expectedVersion)`. Cada acción exige sesión, valida, llama a la RPC, borra de Storage las fotos que ya nadie usa y llama a `updateTag("catalog")`.
- El mapa «fotos en uso» sale de `designs.image_path`; una foto se borra de Storage solo cuando ninguna fila la referencia.
- **Subida de fotos del catálogo:** nueva ruta `app/api/catalog-media/route.ts` (exige sesión, 401 si no) que devuelve una URL firmada de subida (`createSignedUploadUrl`) para una ruta `catalog/<uuid>.<ext>`. El navegador sube directo a Storage desde `product-designs.tsx`. `/api/media` deja de aceptar el prefijo `catalog/` y conserva `background/` y `music/` (Vercel Blob). Tipo y tamaño los hace cumplir el bucket (`file_size_limit` 5 MB, `allowed_mime_types` PNG/JPG/WebP), además de la comprobación previa en el cliente.
- **Validación de URL de imagen:** la lectura entrega URLs que empiezan por `SUPABASE_URL/storage/v1/object/public/catalog/`; si la tienda usa `next/image`, se agrega ese host en `next.config.ts`.
- **Bolsa:** `store-shell.tsx` pasa al proveedor solo `colors` y los datos del encabezado (título, WhatsApp, envío gratis). La reconciliación al montar llama a la server action `getCartProducts(ids)` (`app/_actions/cart.ts`), que devuelve el mismo resumen que hoy (`designs` con `id`, `name`, `image`, `colors`, `stock`) solo para esos productos. `CartLine` y `overcity:cart:v1` no cambian.
- **Límites** en `lib/content-limits.ts`: `MAX_PRODUCTS` 500, `MAX_CATEGORIES` 50, `MAX_DESIGNS` 20, `MAX_COLORS` 60, `MAX_DESIGN_COLORS` 10, `MAX_PRODUCT_IMAGE_BYTES` 5 MB. No cambian: `MAX_DESIGN_NAME` 40, `MAX_COLOR_NAME` 24, `MAX_STOCK` 9999, `MAX_CART_LINES` 30 y los textos del producto. Tope por producto: 20 diseños × 10 colores × 5 tallas = 1000 celdas.
- **Variables de entorno nuevas:** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, nunca `NEXT_PUBLIC_`). `KV_REST_API_*` se mantienen (SiteContent y login); `BLOB_READ_WRITE_TOKEN` se mantiene (logo, fondo, música).

## Plan de implementación

1. Leer en `node_modules/next/dist/docs/` lo relacionado con `"use cache"` con argumentos, server actions y `next/image` con hosts remotos (aviso de Next.js 16 del `CLAUDE.md`), y listar todos los sitios que leen el catálogo o suben fotos `catalog/`: `lib/catalog.ts`, `lib/catalog-shared.ts`, `lib/cart.ts`, `app/admin/catalogo/actions.ts`, `app/api/media/route.ts`, `store-shell.tsx`, `cart-provider.tsx`, `site-view.tsx`, `catalog-browser.tsx`, `product-detail.tsx`, `products-admin.tsx`, `product-editor.tsx`, `product-designs.tsx`, `categories-admin.tsx`, `colors-admin.tsx`, `settings-admin.tsx` y `app/admin/_lib.ts`. Confirmar qué hace hoy el borrado de una categoría con productos. Verificación: se tiene la lista completa y el comportamiento de borrado anotado.
2. Infraestructura Supabase: dependencia `@supabase/supabase-js`, `lib/supabase.ts`, `supabase/migrations/0001_catalog.sql` (tablas, RLS, RPC y bucket `catalog` con 5 MB y tipos permitidos), variables en `.env.example`. La app sigue leyendo Redis. Verificación: el SQL corre sin errores en un proyecto Supabase de pruebas; una consulta de humo con el service role inserta y lee un producto de prueba; con la anon key una lectura de `products` no devuelve filas; subir un archivo de 6 MB o un PDF al bucket es rechazado.
3. Límites y validación por entidad: constantes nuevas en `lib/content-limits.ts` y `validateProduct`, `validateCategories`, `validateColors`, `validateSettings` en `lib/catalog.ts` (`validateCatalog` se conserva para el script). Verificación: `npm run lint` pasa; el panel y la tienda siguen funcionando con Redis; un producto con 21 diseños, 11 colores en un diseño o 501 productos se rechaza y con 20, 10 y 500 se acepta.
4. Migración de datos: `lib/catalog-legacy.ts` (conversiones `v1`→`v2` extraídas sin `server-only`) y `scripts/migrate-catalog-to-supabase.ts` con `--dry-run` (imprime conteos y fotos a copiar sin escribir) y modo real (copia cada foto de Blob a Storage con ruta determinista derivada de la URL original, inserta con upserts, reescribe `image_path`). Se ejecuta con `node --env-file=.env.local` (con `tsx` como dependencia de desarrollo). Verificación: contra el proyecto de pruebas, los conteos de categorías, colores, productos, diseños, colores por diseño y filas de stock coinciden con Redis; el stock total de cada producto es igual al original; cada foto responde 200 desde Storage; una segunda ejecución no cambia ningún conteo ni duplica archivos; Redis y Blob quedan intactos.
5. Capa de datos sobre Postgres: lecturas (`getPublicCatalogList`, `getPublicProduct`, `getAdmin*`) y escrituras (RPC) en `lib/catalog.ts`, con `stockTotal` calculado en la consulta y URLs públicas armadas desde `image_path`. Aún sin conectar a las pantallas. Verificación: con un script de comprobación manual contra los datos migrados, `getPublicProduct` devuelve el mismo producto que el JSON original (diseños, colores en orden, stock), `getPublicCatalogList` omite productos ocultos, `save_product` con una `version` vieja devuelve `conflict` sin escribir, y borrar un color en uso falla por la FK con el conteo.
6. Cambio de las pantallas y las acciones: `/catalogo`, `/catalogo/[id]`, botones por categoría de la home, listas y fichas del panel y todas las acciones de `app/admin/catalogo/actions.ts` pasan a la capa nueva; `saveProduct` envía y recibe `version` y la ficha muestra el mensaje de conflicto; `product-designs.tsx` sube con la URL firmada de `/api/catalog-media` y `/api/media` deja el prefijo `catalog/`; el proveedor de la bolsa recibe temporalmente el resumen completo desde la lista pública. Se desactiva la lectura de Redis para el catálogo. Verificación: con los datos migrados, la tienda y el panel se ven y se comportan igual que antes; crear, editar, mover, ocultar y borrar un producto, y crear/borrar categorías y colores, se reflejan al recargar; una ficha abierta en dos pestañas rechaza el segundo guardado con mensaje; una foto quitada desaparece de Storage al guardar.
7. Bolsa ligera: server action `getCartProducts(ids)` y reconciliación en `cart-provider.tsx` solo con los productos de la bolsa; `store-shell.tsx` deja de enviar el resumen del catálogo. Verificación: una bolsa guardada con líneas válidas, una con producto borrado y una con stock reducido se reconcilian con los mismos avisos que antes; el HTML de `/catalogo` ya no incluye matrices de stock; agregar a la bolsa y abrir WhatsApp produce el mismo mensaje.
8. Corte en producción y cierre: crear el proyecto Supabase de producción, aplicar el SQL, cargar variables en Vercel, congelar ediciones del panel, ejecutar el script contra producción (`--dry-run` primero), desplegar y revisar; actualizar `CLAUDE.md` (modelo, esquema, límites, subida de fotos, variables, rollback) y `.env.example`; comprobar `npm run build`, `npm run lint` y 360 px del panel y la tienda. Verificación: el texto de `CLAUDE.md` coincide con el código y se cumplen los criterios de aceptación.

## Criterios de aceptación

- [ ] `npm run build` y `npm run lint` terminan sin errores, y `/catalogo` y `/catalogo/[id]` siguen sirviéndose desde caché con la etiqueta `catalog`.
- [ ] El catálogo ya no se lee ni se escribe en Redis; `SiteContent`, la sesión y el límite de login siguen en Redis y funcionan igual.
- [ ] Tras ejecutar el script, los conteos de categorías, colores, productos, diseños, colores por diseño y filas de stock en Postgres coinciden con el catálogo de Redis, y el stock total de cada producto no cambia.
- [ ] El script es idempotente: ejecutarlo dos veces no duplica filas ni archivos, y no modifica ni borra nada en Redis ni en Blob.
- [ ] Todas las fotos de diseños se sirven desde Supabase Storage y responden 200; ninguna URL del catálogo apunta ya a `blob.vercel-storage.com`.
- [ ] Con la anon key de Supabase no se puede leer ni escribir ninguna tabla; subir al bucket sin URL firmada falla; un archivo de más de 5 MB o que no sea PNG/JPG/WebP es rechazado por el bucket.
- [ ] `/api/catalog-media` responde 401 sin sesión; `/api/media` rechaza el prefijo `catalog/` y sigue aceptando `background/` y `music/` con sesión.
- [ ] Los límites nuevos se cumplen en servidor: se aceptan 500 productos, 50 categorías, 20 diseños por producto, 60 colores y 10 colores por diseño, y se rechazan con mensaje visible uno más de cada uno.
- [ ] Guardar un producto reescribe solo ese producto: dos administradores guardando productos distintos al mismo tiempo no pierden cambios.
- [ ] Abrir la misma ficha en dos pestañas y guardar en ambas: el segundo guardado se rechaza con `Este producto cambió desde que abriste la ficha. Recarga para ver la versión nueva.` y no escribe.
- [ ] Un color usado por algún diseño no se puede borrar (la base lo impide y el panel muestra el conteo); un nombre de diseño repetido dentro del mismo producto se rechaza.
- [ ] Cambiar `oneSize` de una categoría reajusta el stock de los productos afectados en la misma transacción, igual que antes de este spec.
- [ ] Quitar una foto o un diseño al guardar elimina el archivo de Storage solo si ningún otro diseño lo usa.
- [ ] La tienda, el detalle, la bolsa, el mensaje de WhatsApp, la home y todas las pantallas del panel se ven y se comportan igual que antes de la migración con los mismos datos.
- [ ] El HTML de `/catalogo` no incluye matrices de stock ni descripciones; la bolsa reconcilia pidiendo al servidor solo los productos de sus líneas, con los mismos avisos que antes.
- [ ] Con un catálogo de prueba de 500 productos, `/catalogo` y `/admin/catalogo` cargan y la búsqueda responde sin bloquear la interfaz, y no hay scroll horizontal a 360 px.
- [ ] Las variables nuevas son solo de servidor (ninguna `NEXT_PUBLIC_`) y `.env.example` las documenta.
- [ ] Redesplegar el commit anterior tras el corte vuelve a servir el catálogo desde Redis y Blob tal como estaba al ejecutar la migración.
- [ ] La clave `overcity:cart:v1` y el formato del mensaje de WhatsApp no cambian.

## Decisiones

- **Sí:** Supabase (Postgres) para el catálogo. Es lo que pidió el usuario porque el proyecto va a crecer; Redis seguía siendo suficiente hoy, pero el modelo de un documento no admite concurrencia, consultas ni integridad.
- **Sí:** tablas relacionales. Resuelven escrituras por entidad, unicidad e integridad en la base y dejan listo el stock para el descuento atómico de un spec futuro de pedidos.
- **No:** una fila JSONB con el mismo documento. La migración sería trivial pero solo cambiaría de proveedor: mismos problemas de concurrencia y de tamaño.
- **Sí:** migrar solo el catálogo. Es lo que crece; `SiteContent` es un documento pequeño y la sesión y el rate limit son un caso de uso donde Redis rinde mejor.
- **No:** mover `SiteContent`, el logo, el fondo y la música a Supabase. Sin beneficio de escala y duplicaría trabajo en el panel de links y en `/api/media`.
- **Sí:** fotos del catálogo a Supabase Storage. Un solo proveedor para el catálogo y límites impuestos por el bucket, con subida directa del navegador por URL firmada (como hoy con Blob).
- **No:** dejar las fotos del catálogo en Blob. Mantendría dos proveedores para un mismo dato y el límite de tamaño atado a la ruta actual.
- **Sí:** acceso solo desde el servidor con service role y RLS sin políticas. La tienda ya se sirve desde caché de Next; abrir lectura directa al navegador solo agrega superficie de ataque.
- **No:** lectura pública con anon key.
- **Sí:** guardar `image_path` y no la URL. Un cambio de proyecto o de dominio no obliga a reescribir datos.
- **Sí:** escrituras por entidad con funciones SQL transaccionales. Garantizan que un producto nunca queda a medias (diseños sin stock, colores sin fila).
- **Sí:** control optimista solo en productos (`version`). Es lo que se edita a menudo y lo que pierde más trabajo si se pisa. Categorías, colores y ajustes se guardan al instante como hoy; son listas cortas y un conflicto allí es poco probable y de bajo costo.
- **No:** control optimista en categorías, colores y ajustes. Añadiría UX de conflictos a pantallas de edición inmediata.
- **Sí:** límites de escala media (500 / 50 / 20 / 60 / 10 / 5 MB). Dan margen amplio sobre los 40 / 10 / 8 / 24 / 6 / 2 MB actuales sin obligar a paginar ni a rediseñar las pantallas.
- **No:** «sin tope práctico»: exigiría paginación en servidor en la tienda y el panel (otro spec).
- **Sí:** el stock sigue siendo informativo. El descuento atómico necesita pedidos guardados y checkout, que es otro spec grande.
- **Sí:** lecturas ligeras y bolsa por `getCartProducts`. Con 500 productos, enviar al navegador cada matriz de stock en cada página de la tienda multiplicaría el HTML sin necesidad.
- **No:** paginar o buscar en servidor ahora. Con 500 tarjetas ligeras la búsqueda en el cliente es suficiente.
- **Sí:** script manual de una sola vez, idempotente y sin tocar los datos viejos. Permite ensayar con `--dry-run` y deja un rollback trivial.
- **No:** migración automática en la primera lectura: deja código de migración vivo en producción y riesgo de carreras.
- **Sí:** las conversiones `v1`→`v2` pasan a `lib/catalog-legacy.ts` y solo las usa el script; la app deja de conocer Redis para el catálogo.
- **Sí:** el SQL se aplica a mano en el SQL Editor desde un archivo versionado en el repositorio. Evita depender de la CLI de Supabase para un único administrador.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Se editan productos en el panel viejo después de correr el script y antes del despliegue | Se congelan las ediciones durante el corte; el script se puede volver a ejecutar (idempotente) justo antes de desplegar. |
| La migración copia mal una foto o un stock | `--dry-run` previo, verificación de conteos y sumas de stock por producto, y respuesta 200 de cada foto, todo contra el proyecto de pruebas antes de producción. |
| Un guardado queda a medias | Cada escritura es una RPC transaccional; si falla, no se escribe nada. |
| Se pisan dos guardados del mismo producto | `version` y rechazo con mensaje; el borrador de la ficha no se pierde en pantalla. |
| Se borra de Storage una foto que otro diseño aún usa | El borrado ocurre después de confirmar la RPC y solo para rutas sin ninguna referencia en `designs.image_path`. |
| Se filtra la service role key | Solo en variables de servidor, nunca `NEXT_PUBLIC_`, y solo en `lib/supabase.ts` (server-only). Con RLS sin políticas, la anon key no accede a nada. |
| Build lento o gigante con 500 productos por `generateStaticParams` | Se comprueba con el catálogo de prueba; si hace falta, se limita a los primeros N ids y el resto se genera bajo demanda. |
| Una URL firmada de subida permite subir sin pasar por el límite del cliente | El límite de 5 MB y los tipos permitidos los impone el bucket; la ruta exige sesión y genera la ruta con un uuid propio. |
| Supabase no está disponible | La tienda sigue sirviendo las páginas cacheadas; el panel muestra un error claro. A diferencia de hoy, no hay respaldo con datos por defecto para el catálogo: se acepta, porque un catálogo vacío falso confundiría más. |
| Redis y Blob quedan con datos viejos que parecen vigentes | Se documenta en `CLAUDE.md` que son solo respaldo del corte y se programa su limpieza en un spec posterior. |
| Cambio de proyecto Supabase | Las filas guardan `image_path`, no la URL, y las URLs públicas se arman al leer. |

## Lo que **no** está en este spec

- Pedidos guardados, checkout, descuento atómico de stock, reservas o panel de pedidos.
- Migrar `SiteContent`, el logo, el fondo o la música a Supabase.
- Supabase Auth, clientes con cuenta, varios administradores o roles.
- Búsqueda, filtros o paginación en servidor.
- Borrar las claves `overcity:catalog:*` de Redis y las fotos `catalog/` de Blob.
- Redimensionar imágenes o varias fotos por diseño.
- Cambios en precio, tallas, `overcity:cart:v1`, el máximo de 30 líneas o el formato del mensaje de WhatsApp.
- Realtime, backups programados o réplicas.

Cada uno, si se hace, va en su propio spec.
