-- SPEC 17 — Gestión de pedidos: solicitudes de WhatsApp, congelamiento de inventario y venta.
-- Se aplica a mano en el SQL Editor de Supabase, DESPUÉS de 0001_catalog.sql y ANTES de desplegar
-- el código que la usa. Es seguro volver a ejecutarla. Reemplaza funciones de 0001: si alguna vez
-- se vuelve a ejecutar 0001, hay que ejecutar esta otra vez.

-- ---------------------------------------------------------------- Tablas

create table if not exists order_requests (          -- solicitudes de la tienda; sin datos personales
  code text primary key check (code ~ '^OC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
  lines jsonb not null,  -- [{ productId, designId, color, size, qty, productName, designName, unitPrice }]
  currency text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'convertida', 'descartada')),
  order_id text,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,                                  -- crypto.randomUUID()
  number int generated always as identity unique,       -- se muestra como #0001
  status text not null default 'abierto' check (status in ('abierto', 'vendido', 'cancelado', 'anulado')),
  frozen_until timestamptz check (frozen_until is null or status = 'abierto'),
  request_code text,                                    -- sin FK: la solicitud se borra a los 30 días
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_address text not null default '',            -- ciudad y dirección
  note text not null default '',
  currency text not null,                               -- copiada del catálogo al crear
  discount int not null default 0 check (discount >= 0),
  shipping int not null default 0 check (shipping between 0 and 999999999),
  payment_method text check (payment_method is null or payment_method in
    ('efectivo', 'transferencia', 'nequi_daviplata', 'tarjeta', 'contraentrega', 'otro')),
  payment_note text not null default '',
  proof_path text,                                      -- ruta en el bucket privado
  sold_at timestamptz,
  sold_by_name text,
  void_reason text,
  voided_at timestamptz,
  version int not null default 1,                       -- control optimista
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
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
);

create table if not exists order_events (
  id bigint generated always as identity primary key,
  order_id text not null references orders(id) on delete cascade,
  type text not null check (type in ('creado', 'editado', 'congelado', 'renovado', 'liberado',
    'vendido', 'cancelado', 'anulado', 'comprobante')),
  actor_sub text not null,
  actor_name text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists order_items_combo_idx on order_items (product_id, design_id, color_name, size);
create index if not exists order_items_image_path_idx on order_items (image_path);
create index if not exists orders_status_frozen_idx on orders (status, frozen_until);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists order_requests_status_idx on order_requests (status, created_at desc);
create index if not exists order_events_order_idx on order_events (order_id, id);

-- ---------------------------------------------------------------- Seguridad
-- Igual que 0001: RLS activado sin políticas, y solo el service role accede.

alter table order_requests enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;

revoke all on order_requests, orders, order_items, order_events from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on order_requests, orders, order_items, order_events to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------- Bucket privado de comprobantes
-- Sin políticas sobre storage.objects: solo el service role y las URLs firmadas que él crea.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- ---------------------------------------------------------------- Reservas (derivadas)
-- No hay tabla de reservas: lo reservado es la suma de las líneas de los pedidos abiertos con el
-- congelamiento vigente. Al pasar `frozen_until` las unidades dejan de contar solas.

create or replace function reserved_qty(
  p_product_id text,
  p_design_id text,
  p_color_name text,
  p_size text,
  excluding_order_id text default null
)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(i.qty), 0)::int
  from order_items i
  join orders o on o.id = i.order_id
  where i.product_id = p_product_id
    and i.design_id = p_design_id
    and i.color_name = p_color_name
    and i.size = p_size
    and o.status = 'abierto'
    and o.frozen_until > now()
    and (excluding_order_id is null or o.id <> excluding_order_id)
$$;

-- Stock físico y reservado (por pedidos distintos de `excluding_order_id`) de unos productos.
create or replace function combo_stock(ids text[], excluding_order_id text default null)
returns table (product_id text, design_id text, color_name text, size text, physical int, reserved int)
language sql
stable
security invoker
set search_path = public
as $$
  select s.product_id, s.design_id, s.color_name, s.size, s.qty,
         reserved_qty(s.product_id, s.design_id, s.color_name, s.size, excluding_order_id)
  from design_stock s
  where s.product_id = any(ids)
$$;

-- Bloquea las filas de `products` en orden de id. Todas las funciones que aumentan reservas o
-- cambian stock bloquean primero el pedido (si hay) y después los productos con este orden.
create or replace function lock_products(ids text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from products p where p.id = any(ids) order by p.id for update;
end;
$$;

-- Líneas que no se pueden cubrir. `p_lines`: [{ productId, designId, color, size, qty,
-- productName, designName }]. `missing` = la combinación ya no existe en el catálogo.
-- Se llama con los productos ya bloqueados.
create or replace function order_shortages(p_order_id text, p_lines jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'productId', t.product_id, 'designId', t.design_id,
      'productName', t.product_name, 'designName', t.design_name,
      'color', t.color, 'size', t.size,
      'requested', t.qty, 'available', t.available, 'missing', t.physical is null
    ) order by t.pos), '[]'::jsonb)
  from (
    select
      l.ordinality as pos,
      l.value->>'productId' as product_id,
      l.value->>'designId' as design_id,
      l.value->>'productName' as product_name,
      l.value->>'designName' as design_name,
      l.value->>'color' as color,
      l.value->>'size' as size,
      (l.value->>'qty')::int as qty,
      s.qty as physical,
      case when s.qty is null then 0
        else greatest(s.qty - reserved_qty(l.value->>'productId', l.value->>'designId',
          l.value->>'color', l.value->>'size', p_order_id), 0)
      end as available
    from jsonb_array_elements(p_lines) with ordinality l
    left join design_stock s
      on s.product_id = l.value->>'productId'
     and s.design_id = l.value->>'designId'
     and s.color_name = l.value->>'color'
     and s.size = l.value->>'size'
  ) t
  where t.physical is null or t.qty > t.available
$$;

-- Líneas guardadas de un pedido, con la forma que espera `order_shortages`.
create or replace function order_lines_json(p_order_id text)
returns jsonb
language sql
volatile
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'productId', i.product_id, 'designId', i.design_id, 'color', i.color_name, 'size', i.size,
      'qty', i.qty, 'productName', i.product_name, 'designName', i.design_name
    ) order by i.position), '[]'::jsonb)
  from order_items i
  where i.order_id = p_order_id
$$;

-- Respuesta de error por faltantes: `missing_lines` si alguna combinación ya no existe.
create or replace function shortage_result(p_shortages jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'ok', false,
    'error', case
      when exists (select 1 from jsonb_array_elements(p_shortages) e where (e.value->>'missing')::boolean)
      then 'missing_lines' else 'insufficient_stock' end,
    'shortages', p_shortages
  )
$$;

create or replace function add_order_event(p_order_id text, p_type text, actor jsonb, p_detail jsonb default '{}')
returns void
language sql
security invoker
set search_path = public
as $$
  insert into order_events (order_id, type, actor_sub, actor_name, detail)
  values (p_order_id, p_type, coalesce(actor->>'sub', ''), coalesce(actor->>'name', ''), coalesce(p_detail, '{}'))
$$;

-- ---------------------------------------------------------------- Solicitudes

-- payload: { code, currency, lines }. Purga las vencidas, comprueba el tope de pendientes e inserta.
create or replace function create_order_request(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from order_requests where created_at < now() - interval '30 days';
  if (select count(*) from order_requests where status = 'pendiente') >= 1000 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into order_requests (code, lines, currency)
  values (payload->>'code', payload->'lines', payload->>'currency')
  on conflict (code) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'code_taken');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function discard_order_request(code text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  update order_requests r set status = 'descartada'
    where r.code = discard_order_request.code and r.status = 'pendiente';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'request_unavailable');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- Pedidos

-- payload: { id, requestCode?, customerName, customerPhone, customerAddress, note, discount,
--            shipping, lines: [{ productId, designId, color, size, qty, unitPrice }] }
-- actor: { sub, name }. expected_version nulo = crear.
-- Los nombres y la foto de cada línea nueva se copian del catálogo; los que lleguen en el payload
-- se ignoran. Las líneas que ya existían conservan sus copias.
create or replace function save_order(payload jsonb, expected_version int, actor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  oid text := payload->>'id';
  req_code text := nullif(payload->>'requestCode', '');
  current orders%rowtype;
  creating boolean := expected_version is null;
  frozen boolean := false;
  new_version int;
  req_status text;
  product_ids text[];
  resolved jsonb;
  shortages jsonb;
  subtotal bigint;
  v_discount bigint := coalesce((payload->>'discount')::bigint, 0);
  v_shipping bigint := coalesce((payload->>'shipping')::bigint, 0);
  line_count int;
begin
  if jsonb_typeof(payload->'lines') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;
  line_count := jsonb_array_length(payload->'lines');
  if line_count < 1 or line_count > 50 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  -- 1. Fila del pedido.
  select * into current from orders where id = oid for update;
  if creating then
    if current.id is not null then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    if req_code is not null then
      select r.status into req_status from order_requests r where r.code = req_code for update;
      if req_status is distinct from 'pendiente' then
        return jsonb_build_object('ok', false, 'error', 'request_unavailable');
      end if;
    end if;
  else
    if current.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if current.version <> expected_version then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    if current.status <> 'abierto' then
      return jsonb_build_object('ok', false, 'error', 'not_open');
    end if;
    frozen := coalesce(current.frozen_until > now(), false);
  end if;

  -- 2. Productos, en orden de id.
  select coalesce(array_agg(distinct l.value->>'productId'), '{}') into product_ids
    from jsonb_array_elements(payload->'lines') l;
  perform lock_products(product_ids);

  -- 3. Se resuelven las copias de cada línea: las guardadas o, si es nueva, las del catálogo.
  select jsonb_agg(
    jsonb_build_object(
      'productId', t.product_id, 'designId', t.design_id, 'color', t.color, 'size', t.size,
      'qty', t.qty, 'unitPrice', t.unit_price, 'productName', t.product_name,
      'designName', t.design_name, 'imagePath', t.image_path, 'isNew', t.is_new, 'exists', t.in_catalog
    ) order by t.pos)
  into resolved
  from (
    select
      l.ordinality as pos,
      l.value->>'productId' as product_id,
      l.value->>'designId' as design_id,
      l.value->>'color' as color,
      l.value->>'size' as size,
      (l.value->>'qty')::int as qty,
      (l.value->>'unitPrice')::bigint as unit_price,
      coalesce(i.product_name, p.name) as product_name,
      coalesce(i.design_name, d.name) as design_name,
      coalesce(i.image_path, d.image_path) as image_path,
      i.order_id is null as is_new,
      s.qty is not null as in_catalog
    from jsonb_array_elements(payload->'lines') with ordinality l
    left join order_items i
      on i.order_id = oid
     and i.product_id = l.value->>'productId' and i.design_id = l.value->>'designId'
     and i.color_name = l.value->>'color' and i.size = l.value->>'size'
    left join products p on p.id = l.value->>'productId'
    left join designs d
      on d.product_id = l.value->>'productId' and d.id = l.value->>'designId'
    left join design_stock s
      on s.product_id = l.value->>'productId' and s.design_id = l.value->>'designId'
     and s.color_name = l.value->>'color' and s.size = l.value->>'size'
  ) t;

  -- 4. Comprobaciones. Nada se escribe hasta que todas pasen.
  if exists (
    select 1 from jsonb_array_elements(resolved) r
    where (r.value->>'isNew')::boolean and not (r.value->>'exists')::boolean
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_line');
  end if;
  if exists (
    select 1 from jsonb_array_elements(resolved) r
    where (r.value->>'qty')::int not between 1 and 9999
       or (r.value->>'unitPrice')::bigint not between 0 and 999999999
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;
  if (select count(distinct (r.value->>'productId', r.value->>'designId', r.value->>'color', r.value->>'size'))
        from jsonb_array_elements(resolved) r) <> line_count then
    return jsonb_build_object('ok', false, 'error', 'duplicate_line');
  end if;

  select coalesce(sum((r.value->>'unitPrice')::bigint * (r.value->>'qty')::int), 0) into subtotal
    from jsonb_array_elements(resolved) r
    where r.value->>'unitPrice' is not null;
  if v_discount < 0 or v_discount > subtotal or v_discount > 2147483647 then
    return jsonb_build_object('ok', false, 'error', 'invalid_discount');
  end if;
  if v_shipping < 0 or v_shipping > 999999999 then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;

  -- Un pedido congelado se guarda todo o nada, contra el disponible sin contar sus unidades.
  if frozen then
    shortages := order_shortages(oid, resolved);
    if jsonb_array_length(shortages) > 0 then
      return shortage_result(shortages);
    end if;
  end if;

  -- 5. Escrituras.
  if creating then
    insert into orders (id, request_code, customer_name, customer_phone, customer_address, note,
                        currency, discount, shipping)
    values (
      oid, req_code,
      coalesce(payload->>'customerName', ''), coalesce(payload->>'customerPhone', ''),
      coalesce(payload->>'customerAddress', ''), coalesce(payload->>'note', ''),
      coalesce((select c.currency from catalog_settings c where c.id = 1), 'COP'),
      v_discount, v_shipping
    );
    new_version := 1;
    if req_code is not null then
      update order_requests r set status = 'convertida', order_id = oid where r.code = req_code;
    end if;
  else
    update orders set
      customer_name = coalesce(payload->>'customerName', ''),
      customer_phone = coalesce(payload->>'customerPhone', ''),
      customer_address = coalesce(payload->>'customerAddress', ''),
      note = coalesce(payload->>'note', ''),
      discount = v_discount,
      shipping = v_shipping,
      -- Un congelamiento ya vencido se limpia al editar; uno vigente no cambia.
      frozen_until = case when frozen then frozen_until else null end,
      version = version + 1,
      updated_at = now()
    where id = oid
    returning version into new_version;
    delete from order_items where order_id = oid;
  end if;

  insert into order_items (order_id, product_id, design_id, color_name, size, qty, unit_price,
                           product_name, design_name, image_path, position)
  select oid, r.value->>'productId', r.value->>'designId', r.value->>'color', r.value->>'size',
         (r.value->>'qty')::int, (r.value->>'unitPrice')::int, r.value->>'productName',
         r.value->>'designName', r.value->>'imagePath', r.ordinality - 1
  from jsonb_array_elements(resolved) with ordinality r;

  perform add_order_event(
    oid,
    case when creating then 'creado' else 'editado' end,
    actor,
    jsonb_strip_nulls(jsonb_build_object(
      'requestCode', case when creating then req_code end,
      'lines', line_count,
      'total', subtotal - v_discount + v_shipping
    ))
  );

  return jsonb_build_object('ok', true, 'version', new_version);
exception
  -- Dos creaciones simultáneas del mismo pedido: la segunda revierte todo.
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
end;
$$;

-- Congela o renueva (todo o nada): reserva todas las líneas durante `hours` horas desde ahora.
create or replace function freeze_order(id text, hours int, expected_version int, actor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current orders%rowtype;
  lines jsonb;
  shortages jsonb;
  until_at timestamptz;
  new_version int;
begin
  select * into current from orders o where o.id = freeze_order.id for update;
  if current.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if current.version is distinct from expected_version then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  if current.status <> 'abierto' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if hours is null or hours < 1 or hours > 720 then
    return jsonb_build_object('ok', false, 'error', 'invalid_hours');
  end if;

  perform lock_products(array(select distinct i.product_id from order_items i where i.order_id = current.id));
  lines := order_lines_json(current.id);
  if jsonb_array_length(lines) = 0 then return jsonb_build_object('ok', false, 'error', 'invalid_value'); end if;
  shortages := order_shortages(current.id, lines);
  if jsonb_array_length(shortages) > 0 then return shortage_result(shortages); end if;

  until_at := now() + make_interval(hours => hours);
  update orders o set frozen_until = until_at, version = o.version + 1, updated_at = now()
    where o.id = current.id
    returning o.version into new_version;
  perform add_order_event(
    current.id,
    case when current.frozen_until > now() then 'renovado' else 'congelado' end,
    actor,
    jsonb_build_object('hours', hours, 'until', until_at)
  );
  return jsonb_build_object('ok', true, 'version', new_version);
end;
$$;

create or replace function release_order(id text, expected_version int, actor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current orders%rowtype;
  new_version int;
begin
  select * into current from orders o where o.id = release_order.id for update;
  if current.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if current.version is distinct from expected_version then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  if current.status <> 'abierto' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if current.frozen_until is null then return jsonb_build_object('ok', false, 'error', 'not_frozen'); end if;

  update orders o set frozen_until = null, version = o.version + 1, updated_at = now()
    where o.id = current.id
    returning o.version into new_version;
  perform add_order_event(current.id, 'liberado', actor);
  return jsonb_build_object('ok', true, 'version', new_version);
end;
$$;

create or replace function cancel_order(id text, expected_version int, actor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current orders%rowtype;
  new_version int;
begin
  select * into current from orders o where o.id = cancel_order.id for update;
  if current.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if current.version is distinct from expected_version then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  if current.status <> 'abierto' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;

  update orders o set status = 'cancelado', frozen_until = null, version = o.version + 1, updated_at = now()
    where o.id = current.id
    returning o.version into new_version;
  perform add_order_event(current.id, 'cancelado', actor);
  return jsonb_build_object('ok', true, 'version', new_version);
end;
$$;

-- Venta atómica. payment: { method, note, proofPath? }.
create or replace function sell_order(id text, payment jsonb, expected_version int, actor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current orders%rowtype;
  method text := payment->>'method';
  pay_note text := coalesce(payment->>'note', '');
  proof text := nullif(payment->>'proofPath', '');
  product_ids text[];
  lines jsonb;
  shortages jsonb;
  item order_items%rowtype;
  new_version int;
begin
  select * into current from orders o where o.id = sell_order.id for update;
  if current.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if current.version is distinct from expected_version then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  if current.status <> 'abierto' then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if btrim(current.customer_name) = '' or btrim(current.customer_phone) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_customer');
  end if;
  if method is null or method not in
      ('efectivo', 'transferencia', 'nequi_daviplata', 'tarjeta', 'contraentrega', 'otro')
     or char_length(pay_note) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment');
  end if;
  if proof is not null and (method = 'efectivo' or not starts_with(proof, 'proofs/' || current.id || '/')) then
    return jsonb_build_object('ok', false, 'error', 'invalid_proof');
  end if;
  if exists (select 1 from order_items i where i.order_id = current.id and i.unit_price is null) then
    return jsonb_build_object('ok', false, 'error', 'missing_price');
  end if;

  product_ids := array(select distinct i.product_id from order_items i where i.order_id = current.id);
  perform lock_products(product_ids);
  lines := order_lines_json(current.id);
  if jsonb_array_length(lines) = 0 then return jsonb_build_object('ok', false, 'error', 'invalid_value'); end if;
  -- físico − reservado por otros ≥ cantidad, en todas las líneas.
  shortages := order_shortages(current.id, lines);
  if jsonb_array_length(shortages) > 0 then return shortage_result(shortages); end if;

  for item in select * from order_items i where i.order_id = current.id loop
    update design_stock s set qty = s.qty - item.qty
      where s.product_id = item.product_id and s.design_id = item.design_id
        and s.color_name = item.color_name and s.size = item.size;
    if not found then
      raise exception 'sell_order: la combinación desapareció durante la venta';
    end if;
  end loop;

  -- Sin esto, una ficha abierta antes de la venta restauraría las unidades vendidas.
  update products p set version = p.version + 1, updated_at = now() where p.id = any(product_ids);

  update orders o set
    status = 'vendido', frozen_until = null, payment_method = method, payment_note = pay_note,
    proof_path = proof, sold_at = now(), sold_by_name = coalesce(actor->>'name', ''),
    version = o.version + 1, updated_at = now()
  where o.id = current.id
  returning o.version into new_version;
  perform add_order_event(current.id, 'vendido', actor,
    jsonb_build_object('method', method, 'proof', proof is not null));
  return jsonb_build_object('ok', true, 'version', new_version);
end;
$$;

-- Anula una venta completa y devuelve las unidades. Las líneas cuya combinación ya no existe no se
-- restauran: la anulación continúa y quedan en el evento.
create or replace function void_order(id text, reason text, expected_version int, actor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current orders%rowtype;
  clean_reason text := btrim(coalesce(reason, ''));
  item order_items%rowtype;
  restored text[] := '{}';
  not_restored jsonb := '[]';
  new_version int;
begin
  select * into current from orders o where o.id = void_order.id for update;
  if current.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if current.version is distinct from expected_version then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  if current.status <> 'vendido' then return jsonb_build_object('ok', false, 'error', 'not_sold'); end if;
  if clean_reason = '' or char_length(clean_reason) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;

  perform lock_products(array(select distinct i.product_id from order_items i where i.order_id = current.id));

  for item in select * from order_items i where i.order_id = current.id order by i.position loop
    update design_stock s set qty = least(s.qty + item.qty, 9999)
      where s.product_id = item.product_id and s.design_id = item.design_id
        and s.color_name = item.color_name and s.size = item.size;
    if found then
      restored := restored || item.product_id;
    else
      not_restored := not_restored || jsonb_build_object(
        'productName', item.product_name, 'designName', item.design_name,
        'color', item.color_name, 'size', item.size, 'qty', item.qty);
    end if;
  end loop;

  update products p set version = p.version + 1, updated_at = now() where p.id = any(restored);

  update orders o set status = 'anulado', void_reason = clean_reason, voided_at = now(),
    version = o.version + 1, updated_at = now()
  where o.id = current.id
  returning o.version into new_version;
  perform add_order_event(current.id, 'anulado', actor,
    jsonb_build_object('reason', clean_reason, 'notRestored', not_restored));
  return jsonb_build_object('ok', true, 'version', new_version, 'notRestored', not_restored);
end;
$$;

-- Adjunta o reemplaza el comprobante de una venta no anulada ni en efectivo.
create or replace function set_order_proof(id text, path text, expected_version int, actor jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current orders%rowtype;
  new_version int;
begin
  select * into current from orders o where o.id = set_order_proof.id for update;
  if current.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if current.version is distinct from expected_version then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  if current.status <> 'vendido' then return jsonb_build_object('ok', false, 'error', 'not_sold'); end if;
  if current.payment_method = 'efectivo'
     or path is null or not starts_with(path, 'proofs/' || current.id || '/') then
    return jsonb_build_object('ok', false, 'error', 'invalid_proof');
  end if;

  update orders o set proof_path = set_order_proof.path, version = o.version + 1, updated_at = now()
    where o.id = current.id
    returning o.version into new_version;
  perform add_order_event(current.id, 'comprobante', actor,
    jsonb_build_object('replaced', current.proof_path is not null));
  return jsonb_build_object('ok', true, 'version', new_version, 'previousPath', current.proof_path);
end;
$$;

-- Lista del panel con totales. status_filter: '' (todos) | 'abierto' | 'congelado' | 'vencido' |
-- 'vendido' | 'cancelado' | 'anulado'. `search` llega en minúsculas y sin tildes.
create or replace function order_list(
  status_filter text default '',
  search text default '',
  page_limit int default 50,
  page_offset int default 0
)
returns table (
  id text,
  number int,
  status text,
  frozen_until timestamptz,
  request_code text,
  customer_name text,
  currency text,
  total bigint,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.id, o.number, o.status, o.frozen_until, o.request_code, o.customer_name, o.currency,
    coalesce((select sum(i.unit_price::bigint * i.qty) from order_items i where i.order_id = o.id), 0)
      - o.discount + o.shipping,
    o.created_at,
    count(*) over ()
  from orders o
  where
    case status_filter
      when '' then true
      when 'abierto' then o.status = 'abierto' and o.frozen_until is null
      when 'congelado' then o.status = 'abierto' and o.frozen_until > now()
      when 'vencido' then o.status = 'abierto' and o.frozen_until <= now()
      else o.status = status_filter
    end
    and (
      search = ''
      or (ltrim(search, '#') ~ '^[0-9]{1,9}$' and o.number = ltrim(search, '#')::int)
      or position(search in lower(coalesce(o.request_code, ''))) > 0
      or position(search in translate(lower(o.customer_name), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun')) > 0
      or position(search in lower(o.customer_phone)) > 0
      or (regexp_replace(search, '[^0-9]', '', 'g') ~ '^[0-9]{4,}$'
          and search ~ '^[0-9 +()-]+$'
          and position(regexp_replace(search, '[^0-9]', '', 'g')
                       in regexp_replace(o.customer_phone, '[^0-9]', '', 'g')) > 0)
    )
  order by o.created_at desc, o.number desc
  limit page_limit offset page_offset
$$;

-- ---------------------------------------------------------------- Protección del stock del catálogo

-- Números de los pedidos con reservas vigentes sobre las combinaciones indicadas.
-- `p_combos`: [{ productId, designId, color, size }].
create or replace function reserving_orders(p_combos jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(t.number order by t.number), '[]'::jsonb)
  from (
    select distinct o.number
    from order_items i
    join orders o on o.id = i.order_id
    join jsonb_array_elements(p_combos) c
      on i.product_id = c.value->>'productId' and i.design_id = c.value->>'designId'
     and i.color_name = c.value->>'color' and i.size = c.value->>'size'
    where o.status = 'abierto' and o.frozen_until > now()
  ) t
$$;

-- Combinaciones de un producto con reservas vigentes y su cantidad reservada.
create or replace function reserved_combos(ids text[])
returns table (product_id text, design_id text, color_name text, size text, reserved int)
language sql
volatile
security invoker
set search_path = public
as $$
  select i.product_id, i.design_id, i.color_name, i.size, sum(i.qty)::int
  from order_items i
  join orders o on o.id = i.order_id
  where i.product_id = any(ids) and o.status = 'abierto' and o.frozen_until > now()
  group by i.product_id, i.design_id, i.color_name, i.size
$$;

-- Igual que en 0001, más el rechazo `reserved_stock` antes de escribir.
create or replace function save_product(payload jsonb, expected_version int)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  pid text := payload->>'id';
  current_version int;
  new_version int;
  broken jsonb;
  d record;
  c record;
  s record;
begin
  select version into current_version from products where id = pid for update;

  if expected_version is null then
    if current_version is not null then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    insert into products (id, name, description, price, category_id, visible, position)
    values (
      pid,
      payload->>'name',
      coalesce(payload->>'description', ''),
      nullif(payload->>'price', '')::int,
      nullif(payload->>'categoryId', ''),
      coalesce((payload->>'visible')::boolean, true),
      coalesce((select max(position) + 1 from products), 0)
    );
    new_version := 1;
  else
    if current_version is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if current_version <> expected_version then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;

    -- El stock nuevo no puede quedar por debajo de lo reservado ni quitar la combinación.
    select jsonb_agg(jsonb_build_object(
             'productId', r.product_id, 'designId', r.design_id, 'color', r.color_name, 'size', r.size))
      into broken
      from reserved_combos(array[pid]) r
      where coalesce((
        select (pd.value->'stock'->r.color_name->>r.size)::int
        from jsonb_array_elements(payload->'designs') pd
        where pd.value->>'id' = r.design_id and (pd.value->'colors') ? r.color_name
      ), -1) < r.reserved;
    if broken is not null then
      return jsonb_build_object('ok', false, 'error', 'reserved_stock', 'orders', reserving_orders(broken));
    end if;

    update products set
      name = payload->>'name',
      description = coalesce(payload->>'description', ''),
      price = nullif(payload->>'price', '')::int,
      category_id = nullif(payload->>'categoryId', ''),
      visible = coalesce((payload->>'visible')::boolean, true),
      version = version + 1,
      updated_at = now()
    where id = pid
    returning version into new_version;
    delete from designs where product_id = pid; -- cascada a colores y stock
  end if;

  for d in
    select value, ordinality - 1 as pos
    from jsonb_array_elements(payload->'designs') with ordinality
  loop
    insert into designs (product_id, id, name, name_key, image_path, position)
    values (pid, d.value->>'id', d.value->>'name', d.value->>'nameKey', d.value->>'imagePath', d.pos);

    for c in
      select value #>> '{}' as color_name, ordinality - 1 as pos
      from jsonb_array_elements(d.value->'colors') with ordinality
    loop
      insert into design_colors (product_id, design_id, color_name, position)
      values (pid, d.value->>'id', c.color_name, c.pos);

      for s in
        select key as size, value::int as qty
        from jsonb_each_text(d.value->'stock'->c.color_name)
      loop
        insert into design_stock (product_id, design_id, color_name, size, qty)
        values (pid, d.value->>'id', c.color_name, s.size, s.qty);
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'version', new_version);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_design');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_reference');
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
end;
$$;

create or replace function delete_product(id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  broken jsonb;
begin
  perform lock_products(array[delete_product.id]);
  select jsonb_agg(jsonb_build_object(
           'productId', r.product_id, 'designId', r.design_id, 'color', r.color_name, 'size', r.size))
    into broken
    from reserved_combos(array[delete_product.id]) r;
  if broken is not null then
    return jsonb_build_object('ok', false, 'error', 'reserved_stock', 'orders', reserving_orders(broken));
  end if;

  delete from products where products.id = delete_product.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Igual que en 0001, pero primero bloquea los productos afectados (categoría borrada o cambio de
-- talla única) y rechaza con `reserved_stock` si desaparecería una talla reservada.
create or replace function save_categories(items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  it record;
  pid text;
  affected text[];
  locked text[];
  changed record;
  broken jsonb;
begin
  -- Productos cuyas tallas pueden cambiar, con la talla única que tendrán.
  select coalesce(array_agg(p.id), '{}') into locked
    from products p
    join categories c on c.id = p.category_id
    left join jsonb_array_elements(items) n on n.value->>'id' = c.id
    where n.value is null or (n.value->>'oneSize')::boolean <> c.one_size;
  perform lock_products(locked);

  select jsonb_agg(jsonb_build_object(
           'productId', r.product_id, 'designId', r.design_id, 'color', r.color_name, 'size', r.size))
    into broken
    from reserved_combos(locked) r
    join products p on p.id = r.product_id
    left join jsonb_array_elements(items) n on n.value->>'id' = p.category_id
    where case when coalesce((n.value->>'oneSize')::boolean, false)
            then r.size <> 'Única' else r.size = 'Única' end;
  if broken is not null then
    return jsonb_build_object('ok', false, 'error', 'reserved_stock', 'orders', reserving_orders(broken));
  end if;

  select coalesce(array_agg(p.id), '{}') into affected
    from products p
    where p.category_id is not null
      and p.category_id not in (select value->>'id' from jsonb_array_elements(items));

  delete from categories
    where id not in (select value->>'id' from jsonb_array_elements(items));

  foreach pid in array affected loop
    perform resize_product_stock(pid, false);
  end loop;

  for it in
    select value, ordinality - 1 as pos from jsonb_array_elements(items) with ordinality
  loop
    for changed in
      select p.id from products p
        join categories c on c.id = p.category_id
        where c.id = it.value->>'id' and c.one_size <> (it.value->>'oneSize')::boolean
        order by p.id
    loop
      perform resize_product_stock(changed.id, (it.value->>'oneSize')::boolean);
    end loop;

    insert into categories (id, name, one_size, position)
    values (
      it.value->>'id',
      it.value->>'name',
      (it.value->>'oneSize')::boolean,
      it.pos
    )
    on conflict (id) do update
      set name = excluded.name, one_size = excluded.one_size, position = excluded.position;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- Lecturas del catálogo
-- Nuevo parámetro `discount_reserved`: con true, las cantidades y `stock_total` son el disponible
-- (físico − reservado, sin bajar de 0). Se borran las firmas anteriores para no dejar sobrecargas.
-- El valor por defecto mantiene compatible el código anterior.

drop function if exists catalog_cards(boolean);
drop function if exists catalog_products(text[], boolean);

create or replace function catalog_cards(only_visible boolean default false, discount_reserved boolean default false)
returns table (
  id text,
  name text,
  price int,
  category_id text,
  visible boolean,
  cover_path text,
  hover_path text,
  design_count int,
  cover_color text,
  colors text[],
  stock_total int
)
language sql
stable
security invoker
set search_path = public
as $$
  with reserved as (
    select i.product_id, i.design_id, i.color_name, i.size, sum(i.qty)::int as qty
    from order_items i
    join orders o on o.id = i.order_id
    where discount_reserved and o.status = 'abierto' and o.frozen_until > now()
    group by i.product_id, i.design_id, i.color_name, i.size
  )
  select
    p.id,
    p.name,
    p.price,
    p.category_id,
    p.visible,
    (select d.image_path from designs d where d.product_id = p.id order by d.position limit 1),
    (select d.image_path from designs d where d.product_id = p.id order by d.position offset 1 limit 1),
    (select count(*)::int from designs d where d.product_id = p.id),
    (select dc.color_name
       from design_colors dc
       join designs d on d.product_id = dc.product_id and d.id = dc.design_id
       where d.product_id = p.id
       order by d.position, dc.position
       limit 1),
    coalesce((select array_agg(distinct dc.color_name) from design_colors dc where dc.product_id = p.id), '{}'),
    coalesce((
      select sum(greatest(s.qty - coalesce(r.qty, 0), 0))::int
      from design_stock s
      left join reserved r
        on r.product_id = s.product_id and r.design_id = s.design_id
       and r.color_name = s.color_name and r.size = s.size
      where s.product_id = p.id
    ), 0)
  from products p
  where not only_visible or p.visible
  order by p.position, p.id
$$;

create or replace function catalog_products(
  ids text[],
  only_visible boolean default false,
  discount_reserved boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(t.prod order by t.pos, t.pid), '[]'::jsonb)
  from (
    select
      p.position as pos,
      p.id as pid,
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'price', p.price,
        'categoryId', p.category_id,
        'visible', p.visible,
        'version', p.version,
        'designs', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', d.id,
              'name', d.name,
              'imagePath', d.image_path,
              'colors', coalesce((
                select jsonb_agg(dc.color_name order by dc.position)
                from design_colors dc
                where dc.product_id = d.product_id and dc.design_id = d.id
              ), '[]'::jsonb),
              'stock', coalesce((
                select jsonb_object_agg(s.color_name, s.cells)
                from (
                  select ds.color_name, jsonb_object_agg(ds.size,
                    case when discount_reserved
                      then greatest(ds.qty - reserved_qty(ds.product_id, ds.design_id, ds.color_name, ds.size), 0)
                      else ds.qty end) as cells
                  from design_stock ds
                  where ds.product_id = d.product_id and ds.design_id = d.id
                  group by ds.color_name
                ) s
              ), '{}'::jsonb)
            )
            order by d.position
          )
          from designs d
          where d.product_id = p.id
        ), '[]'::jsonb)
      ) as prod
    from products p
    where p.id = any(ids) and (not only_visible or p.visible)
  ) t
$$;

-- ---------------------------------------------------------------- Permisos de las funciones
-- Solo el service role puede llamarlas.

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'reserved_qty(text, text, text, text, text)',
    'combo_stock(text[], text)',
    'lock_products(text[])',
    'order_shortages(text, jsonb)',
    'order_lines_json(text)',
    'shortage_result(jsonb)',
    'add_order_event(text, text, jsonb, jsonb)',
    'create_order_request(jsonb)',
    'discard_order_request(text)',
    'save_order(jsonb, int, jsonb)',
    'freeze_order(text, int, int, jsonb)',
    'release_order(text, int, jsonb)',
    'cancel_order(text, int, jsonb)',
    'sell_order(text, jsonb, int, jsonb)',
    'void_order(text, text, int, jsonb)',
    'set_order_proof(text, text, int, jsonb)',
    'order_list(text, text, int, int)',
    'reserving_orders(jsonb)',
    'reserved_combos(text[])',
    'save_product(jsonb, int)',
    'delete_product(text)',
    'save_categories(jsonb)',
    'catalog_cards(boolean, boolean)',
    'catalog_products(text[], boolean, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;

-- PostgREST vuelve a leer el esquema.
notify pgrst, 'reload schema';
