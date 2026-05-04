-- public.books: shelf tier + FK into bookshelves for pathfinding join

alter table public.books add column if not exists shelf_level smallint;

comment on column public.books.shelf_level is '1-based shelf tier on bookshelf (1 = lowest); null if unknown';

-- Remove dangling shelf_id before FK (would violate bookshelves PK)
update public.books b
set shelf_id = null
where b.shelf_id is not null
  and not exists (select 1 from public.bookshelves s where s.id = b.shelf_id);

alter table public.books drop constraint if exists books_shelf_level_range;
alter table public.books drop constraint if exists books_shelf_level_requires_shelf;
alter table public.books drop constraint if exists books_shelf_id_fkey;

alter table public.books
  add constraint books_shelf_level_range
    check (shelf_level is null or shelf_level between 1 and 20),
  add constraint books_shelf_level_requires_shelf
    check (shelf_level is null or shelf_id is not null);

alter table public.books
  add constraint books_shelf_id_fkey
    foreign key (shelf_id) references public.bookshelves (id)
    on update cascade
    on delete set null
    deferrable initially deferred;

create index if not exists books_shelf_level_idx on public.books (shelf_id, shelf_level);

create or replace view public.v_book_locations as
select
  b.id as book_id,
  b.sector,
  b.shelf_id,
  b.shelf_level,
  s.cx,
  s.cy,
  s.cz,
  s.yaw,
  s.w,
  s.d,
  s.levels
from public.books b
left join public.bookshelves s on s.id = b.shelf_id;

comment on view public.v_book_locations is 'Book + bookshelf pose for navigation (single query)';

grant select on public.v_book_locations to anon, authenticated;
