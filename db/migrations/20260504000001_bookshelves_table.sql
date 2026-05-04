-- public.bookshelves: map bookshelf pose + levels for navigation (join from books.shelf_id)

create table if not exists public.bookshelves (
  id         text primary key,
  sector     smallint not null,
  cx         numeric(8, 3) not null,
  cy         numeric(8, 3) not null default 0,
  cz         numeric(8, 3) not null,
  w          numeric(8, 3) not null,
  d          numeric(8, 3) not null,
  yaw        numeric(8, 4) not null,
  levels     smallint not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookshelves_id_format check (id ~ '^shelf_[0-9]{3}$'),
  constraint bookshelves_sector_range check (sector between 0 and 9),
  constraint bookshelves_levels_pos check (levels between 1 and 20)
);

create index if not exists bookshelves_sector_idx on public.bookshelves (sector);

comment on table public.bookshelves is 'Physical bookshelf pose (cx,cy,cz,yaw) per map shelf_001…; levels = shelf tier count for shelf_level bounds';

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bookshelves_set_updated_at on public.bookshelves;
create trigger bookshelves_set_updated_at
  before update on public.bookshelves
  for each row
  execute function public.tg_set_updated_at();

alter table public.bookshelves enable row level security;

drop policy if exists "bookshelves_select_all" on public.bookshelves;
create policy "bookshelves_select_all"
  on public.bookshelves
  for select
  to anon, authenticated
  using (true);

grant select on table public.bookshelves to anon, authenticated;
