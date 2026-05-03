-- public.books: physical shelf placement for navigation (matches web shelf_001 … shelf_041)

alter table public.books add column if not exists shelf_id text;

create index if not exists books_shelf_id_idx on public.books (shelf_id);

alter table public.books drop constraint if exists books_shelf_id_format;

alter table public.books add constraint books_shelf_id_format
  check (shelf_id is null or shelf_id ~ '^shelf_[0-9]{3}$');

comment on column public.books.shelf_id is 'Map bookshelf id (shelf_001–shelf_041); seeded from shelfSectorAssignments + round-robin per sector';
