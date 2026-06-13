-- 산책: 초기 스키마 (1회 실행 전용)
--
-- Supabase Dashboard → SQL Editor 에서 이 파일 전체를 붙여넣어 실행하세요.
-- 또는 (psql + DATABASE_URL 설정 시): npm run db:migrate
--
-- 재실행 시 즉시 중단됩니다. 데이터(INSERT)는 포함하지 않습니다.
-- QR 로그인 테이블(login_tickets, web_sessions) 포함.

begin;

-- ---------------------------------------------------------------------------
-- 1) 실행 이력 (1회 가드)
-- ---------------------------------------------------------------------------
create table if not exists public._bookjuk_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now(),
  description text not null default ''
);

do $$
declare
  applied_at timestamptz;
begin
  if exists (
    select 1
    from public._bookjuk_schema_migrations
    where version = 'bookjuk_web_v1'
  ) then
    select m.applied_at
    into applied_at
    from public._bookjuk_schema_migrations as m
    where m.version = 'bookjuk_web_v1';

    raise exception
      'Migration bookjuk_web_v1 already applied at %. Refusing to re-run.',
      applied_at;
  end if;

  if to_regclass('public.books') is not null then
    raise exception
      'public.books already exists. Use a fresh Supabase project, or drop existing schema before migrate_once.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) 확장
-- ---------------------------------------------------------------------------
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 3) ENUM
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.shelf_type_enum as enum ('평가한', '읽은', '읽는중', '쇼핑리스트');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.book_user_state_enum as enum ('LIST', 'READING', 'RATED_ONLY', 'REVIEW_POSTED');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.book_user_state_enum add value if not exists 'PURCHASED';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 4) 코어 테이블
-- ---------------------------------------------------------------------------
create table public.books (
  id text primary key,
  title text not null default '',
  authors text not null default '',
  description text not null default '',
  author_bio text not null default '',
  editorial_review text not null default '',
  publisher text not null default '',
  published_year text not null default '',
  kdc_class_no text not null default '',
  kdc_class_nm text not null default '',
  sector integer not null default 0,
  cover_image_url text not null default '',
  embedding vector(1536)
);

create index books_sector_idx on public.books (sector);

create table public.users (
  users_id text not null,
  username text not null,
  password text not null,
  nickname text not null,
  profile_image_url text,
  bio text,
  preferred_genres text,
  created_at timestamptz not null default now(),
  constraint pk_users primary key (users_id)
);

comment on table public.users is '사용자';
comment on column public.users.users_id is '사용자 ID';

create table public.authors (
  authors_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint pk_authors primary key (authors_id)
);

comment on column public.authors.authors_id is '작가 ID';

create table public.book_authors (
  authors_id text not null,
  books_id text not null,
  role text not null default '저자',
  constraint pk_book_authors primary key (authors_id, books_id),
  constraint fk_book_authors_author foreign key (authors_id) references public.authors (authors_id) on delete cascade,
  constraint fk_book_authors_book foreign key (books_id) references public.books (id) on delete cascade
);

comment on column public.book_authors.authors_id is '작가 ID';
comment on column public.book_authors.books_id is '도서 ID';

create table public.reviews (
  reviews_id text not null,
  users_id text not null,
  books_id text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint pk_reviews primary key (reviews_id),
  constraint fk_reviews_user foreign key (users_id) references public.users (users_id) on delete cascade,
  constraint fk_reviews_book foreign key (books_id) references public.books (id) on delete cascade
);

comment on column public.reviews.reviews_id is '리뷰 ID';

create table public.comments (
  comments_id text not null,
  reviews_id text not null,
  users_id text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint pk_comments primary key (comments_id),
  constraint fk_comments_review foreign key (reviews_id) references public.reviews (reviews_id) on delete cascade,
  constraint fk_comments_user foreign key (users_id) references public.users (users_id) on delete cascade
);

comment on column public.comments.comments_id is '코멘트 ID';

create table public.ratings (
  users_id text not null,
  books_id text not null,
  score numeric(2, 1) not null,
  registered_at timestamptz not null default now(),
  constraint pk_ratings primary key (users_id, books_id),
  constraint fk_ratings_user foreign key (users_id) references public.users (users_id) on delete cascade,
  constraint fk_ratings_book foreign key (books_id) references public.books (id) on delete cascade
);

create table public.conversation (
  conversation_id text not null,
  users_id text not null,
  books_id text,
  created_at timestamptz not null default now(),
  type text not null,
  constraint pk_conversation primary key (conversation_id),
  constraint conversation_type_check check (type in ('agent', 'book_detail')),
  constraint fk_conversation_user foreign key (users_id) references public.users (users_id) on delete cascade,
  constraint fk_conversation_book foreign key (books_id) references public.books (id) on delete set null
);

comment on table public.conversation is '대화방';
comment on column public.conversation.type is 'agent | book_detail';

create table public.conversation_messages (
  conversation_messages_id text not null,
  conversation_id text not null,
  role text not null,
  content text not null,
  intent text,
  created_at timestamptz not null default now(),
  constraint pk_conversation_messages primary key (conversation_messages_id),
  constraint conversation_messages_role_check check (role in ('user', 'ai')),
  constraint fk_conversation_messages_room foreign key (conversation_id) references public.conversation (conversation_id) on delete cascade
);

comment on table public.conversation_messages is '대화 메시지';

create table public.review_likes (
  users_id text not null,
  reviews_id text not null,
  created_at timestamptz not null default now(),
  constraint pk_review_likes primary key (users_id, reviews_id),
  constraint fk_review_likes_user foreign key (users_id) references public.users (users_id) on delete cascade,
  constraint fk_review_likes_review foreign key (reviews_id) references public.reviews (reviews_id) on delete cascade
);

create table public.book_api_cache (
  isbn text not null,
  description text,
  author_bio text,
  editorial_review text,
  keywords jsonb,
  subject_names jsonb,
  wiki_book_summary text,
  wiki_author_summary text,
  wiki_extra_sections jsonb,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint pk_book_api_cache primary key (isbn)
);

create table public.shelves (
  shelves_id text not null,
  users_id text not null,
  shelf_type public.shelf_type_enum not null,
  created_at timestamptz not null default now(),
  constraint pk_shelves primary key (shelves_id),
  constraint fk_shelves_user foreign key (users_id) references public.users (users_id) on delete cascade
);

comment on column public.shelves.shelves_id is '보관함 ID';

create table public.shelf_books (
  books_id text not null,
  shelves_id text not null,
  added_at timestamptz not null default now(),
  constraint pk_shelf_books primary key (books_id, shelves_id),
  constraint fk_shelf_books_book foreign key (books_id) references public.books (id) on delete cascade,
  constraint fk_shelf_books_shelf foreign key (shelves_id) references public.shelves (shelves_id) on delete cascade
);

create table public.book_vectors (
  book_vectors_id uuid not null default gen_random_uuid(),
  isbn text,
  title text not null,
  authors text,
  vector jsonb not null,
  kdc_class text,
  is_cold_start boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_book_vectors primary key (book_vectors_id)
);

create unique index book_vectors_isbn_unique on public.book_vectors (isbn);

create table public.collections (
  collections_id text not null,
  users_id text not null,
  title text not null,
  description text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pk_collections primary key (collections_id),
  constraint fk_collections_user foreign key (users_id) references public.users (users_id) on delete cascade
);

create table public.collection_books (
  books_id text not null,
  collections_id text not null,
  order_index integer not null default 0,
  added_at timestamptz not null default now(),
  constraint pk_collection_books primary key (books_id, collections_id),
  constraint fk_collection_books_book foreign key (books_id) references public.books (id) on delete cascade,
  constraint fk_collection_books_collection foreign key (collections_id) references public.collections (collections_id) on delete cascade
);

create table public.book_user_states (
  users_id text not null,
  books_id text not null,
  shelf_state public.book_user_state_enum not null,
  reading_proof_url text,
  comment_prompted_at timestamptz,
  context_tags jsonb,
  updated_at timestamptz not null default now(),
  constraint pk_book_user_states primary key (users_id, books_id),
  constraint fk_book_user_states_user foreign key (users_id) references public.users (users_id) on delete cascade,
  constraint fk_book_user_states_book foreign key (books_id) references public.books (id) on delete cascade
);

create table public.purchase_receipts (
  receipt_id text not null,
  users_id text not null,
  purchased_at timestamptz not null default now(),
  qr_payload text not null,
  created_at timestamptz not null default now(),
  constraint pk_purchase_receipts primary key (receipt_id),
  constraint fk_purchase_receipts_user foreign key (users_id) references public.users (users_id) on delete cascade
);

create table public.purchase_receipt_items (
  receipt_id text not null,
  books_id text not null,
  title_snapshot text not null default '',
  authors_snapshot text not null default '',
  cover_image_url_snapshot text not null default '',
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pk_purchase_receipt_items primary key (receipt_id, books_id),
  constraint fk_purchase_receipt_items_receipt foreign key (receipt_id) references public.purchase_receipts (receipt_id) on delete cascade,
  constraint fk_purchase_receipt_items_book foreign key (books_id) references public.books (id) on delete cascade
);

create table public.user_taste_profiles (
  users_id text not null,
  profile_version text not null default 'v1',
  computed_at timestamptz not null default now(),
  seed_weights jsonb not null default '{}'::jsonb,
  genre_weights jsonb not null default '{}'::jsonb,
  author_weights jsonb not null default '{}'::jsonb,
  richness double precision not null default 0.0,
  alpha_suggested double precision not null default 0.1,
  lambda_decay double precision not null default 0.1,
  source_window_days integer not null default 30,
  action_count integer not null default 0,
  unique_book_count integer not null default 0,
  recent_actions_summary jsonb not null default '[]'::jsonb,
  model_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_user_taste_profiles primary key (users_id),
  constraint fk_user_taste_profiles_user foreign key (users_id) references public.users (users_id) on delete cascade,
  constraint chk_user_taste_profiles_source_window_days check (source_window_days > 0),
  constraint chk_user_taste_profiles_alpha check (alpha_suggested >= 0 and alpha_suggested <= 1),
  constraint chk_user_taste_profiles_richness check (richness >= 0 and richness <= 1)
);

comment on table public.user_taste_profiles is '사용자 취향 스냅샷(행동 이력 기반 계산 결과)';
comment on column public.user_taste_profiles.seed_weights is 'ISBN별 취향 가중치(JSONB)';
comment on column public.user_taste_profiles.genre_weights is '장르별 취향 가중치(JSONB)';
comment on column public.user_taste_profiles.profile_version is '취향 계산 로직 버전';

create index user_taste_profiles_computed_at_idx
  on public.user_taste_profiles (computed_at desc);
create index user_taste_profiles_profile_version_idx
  on public.user_taste_profiles (profile_version);

create or replace function public.set_updated_at_user_taste_profiles()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_set_updated_at_user_taste_profiles
before update on public.user_taste_profiles
for each row
execute function public.set_updated_at_user_taste_profiles();

create table public.stores (
  stores_id text not null,
  name text not null,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  phone text,
  business_hours text,
  created_at timestamptz not null default now(),
  constraint pk_stores primary key (stores_id)
);

-- ---------------------------------------------------------------------------
-- 5) 하이브리드 추천 KG
-- ---------------------------------------------------------------------------
create table public.kg_nodes (
  kg_nodes_id text not null primary key,
  attrs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.kg_nodes is '하이브리드 추천 LLM 추출 KG 노드 (NetworkX 노드 속성)';
comment on column public.kg_nodes.attrs is 'type, label 등 NetworkX 노드 속성 전체';

create table public.kg_edges (
  src_id text not null,
  dst_id text not null,
  edge_key int not null default 0,
  relation text not null default 'RELATED_TO',
  confidence double precision not null default 1.0,
  attrs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pk_kg_edges primary key (src_id, dst_id, edge_key),
  constraint fk_kg_edges_src foreign key (src_id) references public.kg_nodes (kg_nodes_id) on delete cascade,
  constraint fk_kg_edges_dst foreign key (dst_id) references public.kg_nodes (kg_nodes_id) on delete cascade
);

comment on table public.kg_edges is '하이브리드 추천 KG 멀티 엣지 (NetworkX MultiDiGraph)';

create index kg_edges_src_idx on public.kg_edges (src_id);
create index kg_edges_dst_idx on public.kg_edges (dst_id);

create or replace function public.clear_hybrid_kg()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.kg_edges, public.kg_nodes;
end;
$$;

comment on function public.clear_hybrid_kg() is 'kg_edges / kg_nodes 전체 비우기 (전체 스냅샷 저장 전용)';

revoke all on function public.clear_hybrid_kg() from public;
grant execute on function public.clear_hybrid_kg() to service_role;

-- ---------------------------------------------------------------------------
-- 6) QR 웹 로그인
-- ---------------------------------------------------------------------------
create table public.login_tickets (
  id uuid primary key default gen_random_uuid(),
  qr_token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'used', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  approved_user_id text,
  approved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index login_tickets_status_idx on public.login_tickets (status);
create index login_tickets_expires_at_idx on public.login_tickets (expires_at);

create table public.web_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique,
  users_id text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index web_sessions_users_id_idx on public.web_sessions (users_id);
create index web_sessions_expires_at_idx on public.web_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
alter table public.books enable row level security;
create policy books_select_public
  on public.books for select to anon, authenticated using (true);

alter table public.authors enable row level security;
create policy authors_select_public
  on public.authors for select to anon, authenticated using (true);

alter table public.book_authors enable row level security;
create policy book_authors_select_public
  on public.book_authors for select to anon, authenticated using (true);

alter table public.stores enable row level security;
create policy stores_select_public
  on public.stores for select to anon, authenticated using (true);

alter table public.ratings enable row level security;
create policy ratings_select_public
  on public.ratings for select to anon, authenticated using (true);

alter table public.book_api_cache enable row level security;
create policy book_api_cache_select_public
  on public.book_api_cache for select to anon, authenticated using (true);

alter table public.shelves enable row level security;
create policy shelves_client_all
  on public.shelves for all to anon, authenticated using (true) with check (true);

alter table public.shelf_books enable row level security;
create policy shelf_books_client_all
  on public.shelf_books for all to anon, authenticated using (true) with check (true);

alter table public.book_user_states enable row level security;
create policy book_user_states_client_all
  on public.book_user_states for all to anon, authenticated using (true) with check (true);

alter table public.conversation enable row level security;
create policy conversation_client_all
  on public.conversation for all to anon, authenticated using (true) with check (true);

alter table public.conversation_messages enable row level security;
create policy conversation_messages_client_all
  on public.conversation_messages for all to anon, authenticated using (true) with check (true);

alter table public.purchase_receipts enable row level security;
create policy purchase_receipts_client_all
  on public.purchase_receipts for all to anon, authenticated using (true) with check (true);

alter table public.purchase_receipt_items enable row level security;
create policy purchase_receipt_items_client_all
  on public.purchase_receipt_items for all to anon, authenticated using (true) with check (true);

alter table public.user_taste_profiles enable row level security;
create policy user_taste_profiles_select_public
  on public.user_taste_profiles for select to anon, authenticated using (true);
create policy user_taste_profiles_service_all
  on public.user_taste_profiles for all to service_role using (true) with check (true);

alter table public.login_tickets enable row level security;
create policy login_tickets_client_all
  on public.login_tickets for all to anon, authenticated using (true) with check (true);

alter table public.web_sessions enable row level security;
create policy web_sessions_client_all
  on public.web_sessions for all to anon, authenticated using (true) with check (true);

alter table public.users enable row level security;
alter table public.reviews enable row level security;
alter table public.comments enable row level security;
alter table public.review_likes enable row level security;
alter table public.book_vectors enable row level security;
alter table public.collections enable row level security;
alter table public.collection_books enable row level security;
alter table public.kg_nodes enable row level security;
alter table public.kg_edges enable row level security;

-- ---------------------------------------------------------------------------
-- 8) 실행 완료 기록
-- ---------------------------------------------------------------------------
insert into public._bookjuk_schema_migrations (version, description)
values (
  'bookjuk_web_v1',
  'Initial schema: core tables + KG + QR login + web client RLS (no seed data)'
);

commit;
