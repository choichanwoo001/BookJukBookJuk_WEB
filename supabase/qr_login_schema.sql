-- QR web auto-login schema (execute once on your Supabase project)
create extension if not exists pgcrypto;

create table if not exists public.login_tickets (
  id uuid primary key default gen_random_uuid(),
  qr_token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'used', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  approved_user_id text,
  approved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists login_tickets_status_idx on public.login_tickets (status);
create index if not exists login_tickets_expires_at_idx on public.login_tickets (expires_at);

create table if not exists public.web_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique,
  users_id text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists web_sessions_users_id_idx on public.web_sessions (users_id);
create index if not exists web_sessions_expires_at_idx on public.web_sessions (expires_at);
