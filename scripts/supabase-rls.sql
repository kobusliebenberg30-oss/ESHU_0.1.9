-- Supabase starter schema for profiles, comments, images, and posts.
-- Run this in Supabase SQL Editor after creating your project.

-- 1) Core tables
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Helpful indexes
create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_comments_author_id on public.comments(author_id, created_at desc);
create index if not exists idx_images_owner_id on public.images(owner_id, created_at desc);
create index if not exists idx_posts_author_id on public.posts(author_id, created_at desc);

-- 3) Enable RLS
alter table public.profiles enable row level security;
alter table public.comments enable row level security;
alter table public.images enable row level security;
alter table public.posts enable row level security;

-- 4) Policies
create policy if not exists "profiles_are_viewable_by_everyone"
  on public.profiles for select
  using (true);

create policy if not exists "users_can_insert_own_profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy if not exists "users_can_update_own_profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "comments_are_readable_by_everyone"
  on public.comments for select
  using (true);

create policy if not exists "users_can_insert_own_comments"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy if not exists "users_can_update_own_comments"
  on public.comments for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy if not exists "users_can_delete_own_comments"
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

create policy if not exists "images_are_readable_by_everyone"
  on public.images for select
  using (true);

create policy if not exists "users_can_upload_own_images"
  on public.images for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy if not exists "users_can_delete_own_images"
  on public.images for delete
  to authenticated
  using (auth.uid() = owner_id);

create policy if not exists "posts_are_readable_by_everyone"
  on public.posts for select
  using (true);

create policy if not exists "users_can_insert_own_posts"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy if not exists "users_can_update_own_posts"
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy if not exists "users_can_delete_own_posts"
  on public.posts for delete
  to authenticated
  using (auth.uid() = author_id);
