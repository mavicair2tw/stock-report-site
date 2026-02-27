-- PostgreSQL schema (normalized)

create table roles (
  id smallserial primary key,
  code text unique not null, -- GUEST/NEW_USER/VERIFIED/TRUSTED/MOD/ADMIN
  name text not null
);

create table users (
  id bigserial primary key,
  email citext unique not null,
  password_hash text not null,
  role_id smallint not null references roles(id),
  is_email_verified boolean not null default false,
  twofa_enabled boolean not null default false,
  trust_score int not null default 0,
  shadow_banned boolean not null default false,
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id bigserial primary key,
  slug text unique not null,
  title text not null,
  description text,
  created_by bigint references users(id),
  created_at timestamptz not null default now()
);

create table threads (
  id bigserial primary key,
  category_id bigint not null references categories(id),
  user_id bigint not null references users(id),
  title text not null,
  body text not null,
  score int not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table posts (
  id bigserial primary key,
  thread_id bigint not null references threads(id) on delete cascade,
  user_id bigint not null references users(id),
  parent_post_id bigint references posts(id) on delete cascade,
  body text not null,
  score int not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table post_votes (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

create table reports (
  id bigserial primary key,
  target_type text not null check (target_type in ('thread','post','user')),
  target_id bigint not null,
  reporter_user_id bigint not null references users(id),
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table moderation_logs (
  id bigserial primary key,
  moderator_user_id bigint references users(id),
  action text not null,
  target_type text not null,
  target_id bigint not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create table rate_limits (
  id bigserial primary key,
  scope text not null, -- ip/user/login
  scope_key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  unique(scope, scope_key, window_start)
);

create table login_attempts (
  id bigserial primary key,
  email text,
  ip inet,
  success boolean not null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key,
  actor_user_id bigint references users(id),
  event text not null,
  ip inet,
  user_agent text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index idx_threads_category_created on threads(category_id, created_at desc);
create index idx_posts_thread_created on posts(thread_id, created_at asc);
create index idx_reports_status_created on reports(status, created_at asc);
