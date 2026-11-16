-- SPEC 12 — Catálogo en Supabase (Postgres y Storage).
-- Se aplica a mano en el SQL Editor de Supabase. Es seguro volver a ejecutarlo
-- (tablas con "if not exists", funciones con "create or replace", bucket con upsert).

-- ---------------------------------------------------------------- Tablas

create table if not exists catalog_settings (
  id int primary key default 1 check (id = 1),     -- una sola fila
  title text not null,
  currency text not null,
  whatsapp text not null default '',               -- solo dígitos con prefijo, '' = sin configurar
  free_shipping_from integer
);

create table if not exists categories (
  id text primary key,                             -- mismos ids actuales (crypto.randomUUID)
  name text not null,
  one_size boolean not null default false,
  position integer not null
);

create table if not exists colors (
  name text primary key,                           -- identificador estable (SPEC 11)
  name_key text not null unique,                   -- nombre sin mayúsculas ni tildes
  hex text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
  hidden boolean not null default false,
  position integer not null
);

create table if not exists products (
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

create index if not exists products_position_idx on products (position);
create index if not exists products_category_idx on products (category_id);

create table if not exists designs (
  product_id text not null references products(id) on delete cascade,
  id text not null,                                -- estable dentro del producto
  name text not null,
  name_key text not null,
  image_path text not null,                        -- ruta en el bucket `catalog`, no la URL completa
  position integer not null,
  primary key (product_id, id),
  unique (product_id, name_key)                    -- nombre único por producto (SPEC 10)
);

create index if not exists designs_image_path_idx on designs (image_path);

create table if not exists design_colors (
  product_id text not null,
  design_id text not null,
  color_name text not null references colors(name) on delete restrict,  -- un color en uso no se borra
  position integer not null,
  primary key (product_id, design_id, color_name),
  foreign key (product_id, design_id) references designs(product_id, id) on delete cascade
);

create index if not exists design_colors_color_idx on design_colors (color_name);

create table if not exists design_stock (
  product_id text not null,
  design_id text not null,
  color_name text not null,
  size text not null,                              -- XS..XL o 'Única'
  qty integer not null check (qty between 0 and 9999),
  primary key (product_id, design_id, color_name, size),
  foreign key (product_id, design_id, color_name)
    references design_colors(product_id, design_id, color_name) on delete cascade
);

-- ---------------------------------------------------------------- Seguridad
-- RLS activado en todas las tablas y sin políticas: solo el service role accede.

alter table catalog_settings enable row level security;
alter table categories enable row level security;
alter table colors enable row level security;
alter table products enable row level security;
alter table designs enable row level security;
alter table design_colors enable row level security;
alter table design_stock enable row level security;

revoke all on catalog_settings, categories, colors, products, designs, design_colors, design_stock
  from anon, authenticated;

-- ---------------------------------------------------------------- Funciones (RPC)
-- Todas "security invoker"; se llaman solo con el service role. Cada una corre en una transacción
-- y devuelve { ok, error?, version? }.

-- Reajusta el stock de un producto a las tallas de su categoría (lógica de resizeStock):
--   encender talla única suma las tallas de cada color en 'Única';
--   apagarla deja las celdas de cada color en 0. Incrementa la versión del producto.
create or replace function resize_product_stock(pid text, one_size boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  s text;
begin
  if one_size then
    for r in
      select design_id, color_name, sum(qty)::int as total
      from design_stock
      where product_id = pid
      group by design_id, color_name
      having bool_or(size <> 'Única')
    loop
      delete from design_stock
        where product_id = pid and design_id = r.design_id and color_name = r.color_name;
      insert into design_stock (product_id, design_id, color_name, size, qty)
        values (pid, r.design_id, r.color_name, 'Única', least(r.total, 9999));
    end loop;
  else
    for r in
      select design_id, color_name
      from design_stock
      where product_id = pid
      group by design_id, color_name
      having bool_or(size = 'Única')
    loop
      delete from design_stock
        where product_id = pid and design_id = r.design_id and color_name = r.color_name;
      foreach s in array array['XS', 'S', 'M', 'L', 'XL'] loop
        insert into design_stock (product_id, design_id, color_name, size, qty)
          values (pid, r.design_id, r.color_name, s, 0);
      end loop;
    end loop;
  end if;
  update products set version = version + 1, updated_at = now() where id = pid;
end;
$$;

-- payload: { id, name, description, price, categoryId, visible,
--            designs: [{ id, name, nameKey, imagePath, colors: [name], stock: { color: { size: qty } } }] }
-- expected_version nulo = crear; si no, actualizar solo si la versión guardada coincide.
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
begin
  delete from products where products.id = delete_product.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function set_product_visible(id text, visible boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_version int;
begin
  update products
    set visible = set_product_visible.visible, version = version + 1, updated_at = now()
    where products.id = set_product_visible.id
    returning version into new_version;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'version', new_version);
end;
$$;

-- Intercambia la posición con el vecino (offset -1 o 1). No incrementa la versión.
create or replace function move_product(id text, "offset" int)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  ids text[];
  idx int;
  target int;
  other text;
  my_pos int;
  other_pos int;
begin
  select array_agg(p.id order by p.position, p.id) into ids from products p;
  idx := array_position(ids, move_product.id);
  if idx is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  target := idx + "offset";
  if target < 1 or target > array_length(ids, 1) then
    return jsonb_build_object('ok', true);
  end if;
  other := ids[target];
  select position into my_pos from products where products.id = move_product.id;
  select position into other_pos from products where products.id = other;
  if my_pos = other_pos then
    -- posiciones repetidas: se renumera la lista completa antes de intercambiar
    update products p set position = n.rn - 1
      from (select pr.id, row_number() over (order by pr.position, pr.id) as rn from products pr) n
      where p.id = n.id;
    select position into my_pos from products where products.id = move_product.id;
    select position into other_pos from products where products.id = other;
  end if;
  update products set position = other_pos where products.id = move_product.id;
  update products set position = my_pos where products.id = other;
  return jsonb_build_object('ok', true);
end;
$$;

-- items: [{ id, name, oneSize }] en el orden de la pantalla. Los productos de una categoría
-- borrada quedan sin categoría y con tallas XS–XL; si cambia oneSize se reajusta el stock.
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
  changed record;
begin
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

-- items: [{ name, nameKey, hex, hidden }] en el orden de la lista.
-- Borrar un color en uso falla por la FK (error = 'color_in_use').
create or replace function save_colors(items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  it record;
begin
  delete from colors
    where name not in (select value->>'name' from jsonb_array_elements(items));

  for it in
    select value, ordinality - 1 as pos from jsonb_array_elements(items) with ordinality
  loop
    insert into colors (name, name_key, hex, hidden, position)
    values (
      it.value->>'name',
      it.value->>'nameKey',
      it.value->>'hex',
      (it.value->>'hidden')::boolean,
      it.pos
    )
    on conflict (name) do update
      set hex = excluded.hex, hidden = excluded.hidden, position = excluded.position;
  end loop;

  return jsonb_build_object('ok', true);
exception
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'color_in_use');
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_color');
end;
$$;

-- payload: { title, currency, whatsapp, freeShippingFrom }
create or replace function save_settings(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into catalog_settings (id, title, currency, whatsapp, free_shipping_from)
  values (
    1,
    payload->>'title',
    payload->>'currency',
    coalesce(payload->>'whatsapp', ''),
    nullif(payload->>'freeShippingFrom', '')::int
  )
  on conflict (id) do update
    set title = excluded.title,
        currency = excluded.currency,
        whatsapp = excluded.whatsapp,
        free_shipping_from = excluded.free_shipping_from;
  return jsonb_build_object('ok', true);
end;
$$;

-- Solo el service role puede llamar a las funciones.
revoke all on function resize_product_stock(text, boolean) from public, anon, authenticated;
revoke all on function save_product(jsonb, int) from public, anon, authenticated;
revoke all on function delete_product(text) from public, anon, authenticated;
revoke all on function set_product_visible(text, boolean) from public, anon, authenticated;
revoke all on function move_product(text, int) from public, anon, authenticated;
revoke all on function save_categories(jsonb) from public, anon, authenticated;
revoke all on function save_colors(jsonb) from public, anon, authenticated;
revoke all on function save_settings(jsonb) from public, anon, authenticated;

grant execute on function resize_product_stock(text, boolean) to service_role;
grant execute on function save_product(jsonb, int) to service_role;
grant execute on function delete_product(text) to service_role;
grant execute on function set_product_visible(text, boolean) to service_role;
grant execute on function move_product(text, int) to service_role;
grant execute on function save_categories(jsonb) to service_role;
grant execute on function save_colors(jsonb) to service_role;
grant execute on function save_settings(jsonb) to service_role;

-- ---------------------------------------------------------------- Storage
-- Bucket público de lectura; la escritura solo la hace el servidor (URL firmada o service role).
-- No se crean políticas sobre storage.objects. Tamaño y tipos los impone el bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog', 'catalog', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- ---------------------------------------------------------------- Lecturas (RPC)
-- Consultas de solo lectura para la tienda y el panel. Se llaman solo con el service role.

-- Tarjetas ligeras (sin descripción ni matriz de stock): portada, segunda foto, colores y total de stock.
create or replace function catalog_cards(only_visible boolean default false)
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
    coalesce((select sum(s.qty)::int from design_stock s where s.product_id = p.id), 0)
  from products p
  where not only_visible or p.visible
  order by p.position, p.id
$$;

-- Productos completos (diseños, colores y stock) para unos ids; devuelve un arreglo jsonb.
create or replace function catalog_products(ids text[], only_visible boolean default false)
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
                  select ds.color_name, jsonb_object_agg(ds.size, ds.qty) as cells
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

-- En cuántos diseños y productos se usa cada color (solo los que se usan).
create or replace function catalog_color_usage()
returns table (color_name text, designs int, products int)
language sql
stable
security invoker
set search_path = public
as $$
  select dc.color_name, count(*)::int, count(distinct dc.product_id)::int
  from design_colors dc
  group by dc.color_name
$$;

revoke all on function catalog_cards(boolean) from public, anon, authenticated;
revoke all on function catalog_products(text[], boolean) from public, anon, authenticated;
revoke all on function catalog_color_usage() from public, anon, authenticated;
grant execute on function catalog_cards(boolean) to service_role;
grant execute on function catalog_products(text[], boolean) to service_role;
grant execute on function catalog_color_usage() to service_role;
