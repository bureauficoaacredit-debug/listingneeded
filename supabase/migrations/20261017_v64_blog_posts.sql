-- v64: Blog. Public reads published posts only; only the admin (private.admins via is_admin()) can write.
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  body text not null default '',
  cover_image_url text,
  category text not null default '',
  published boolean not null default false,
  published_at timestamptz,
  author text not null default 'Marcel Najar',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_published_idx on public.blog_posts (published, published_at desc);

alter table public.blog_posts enable row level security;
drop policy if exists "blog read: published or admin" on public.blog_posts;
create policy "blog read: published or admin" on public.blog_posts for select
  using (published or (select public.is_admin()));
drop policy if exists "blog insert: admin" on public.blog_posts;
create policy "blog insert: admin" on public.blog_posts for insert with check ((select public.is_admin()));
drop policy if exists "blog update: admin" on public.blog_posts;
create policy "blog update: admin" on public.blog_posts for update using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "blog delete: admin" on public.blog_posts;
create policy "blog delete: admin" on public.blog_posts for delete using ((select public.is_admin()));
grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

-- keep updated_at fresh; stamp published_at the first time a post is published
create or replace function private.blog_posts_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.published and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists blog_posts_touch on public.blog_posts;
create trigger blog_posts_touch before insert or update on public.blog_posts
  for each row execute function private.blog_posts_touch();
