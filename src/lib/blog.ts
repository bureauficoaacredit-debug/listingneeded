import { supabaseFetch } from './supabase'

/** v64 Blog. Public: published posts only (RLS). Admin: full read/write via is_admin() RLS. */
export type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  body: string
  cover_image_url: string | null
  category: string
  published: boolean
  published_at: string | null
  author: string
  created_at: string
  updated_at: string
}
export type BlogCard = Pick<BlogPost, 'id' | 'title' | 'slug' | 'excerpt' | 'cover_image_url' | 'category' | 'published_at' | 'author'>
export type BlogInput = Pick<BlogPost, 'title' | 'slug' | 'excerpt' | 'body' | 'cover_image_url' | 'category' | 'published'>

const CARD_COLS = 'id,title,slug,excerpt,cover_image_url,category,published_at,author'

async function errorText(res: Response, fallback: string) {
  const d = await res.json().catch(() => ({}))
  const m = String(d.message || d.error_description || d.error || fallback)
  return /duplicate key|blog_posts_slug_key/i.test(m) ? 'Another post already uses this web address (slug). Change the slug.' : m
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '')
}

export async function fetchPublishedPosts(): Promise<BlogCard[]> {
  const res = await supabaseFetch(`/rest/v1/blog_posts?published=eq.true&select=${CARD_COLS}&order=published_at.desc&limit=200`)
  if (!res.ok) throw new Error(await errorText(res, 'Could not load the blog'))
  return res.json()
}

export async function fetchPostBySlug(slug: string): Promise<BlogPost | null> {
  const res = await supabaseFetch(`/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`)
  if (!res.ok) throw new Error(await errorText(res, 'Could not load this article'))
  const rows = (await res.json()) as BlogPost[]
  return rows[0] ?? null
}

/** Admin: every post, drafts included (RLS returns drafts only to the admin). */
export async function fetchAllPosts(): Promise<BlogPost[]> {
  const res = await supabaseFetch('/rest/v1/blog_posts?select=*&order=created_at.desc&limit=500')
  if (!res.ok) throw new Error(await errorText(res, 'Could not load posts'))
  return res.json()
}

const clean = (p: Partial<BlogInput>) => ({
  ...p,
  ...(p.cover_image_url !== undefined ? { cover_image_url: p.cover_image_url?.trim() || null } : {}),
})

export async function createPost(p: BlogInput): Promise<BlogPost> {
  const res = await supabaseFetch('/rest/v1/blog_posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(clean(p)),
  })
  if (!res.ok) throw new Error(await errorText(res, 'Could not save the post'))
  return ((await res.json()) as BlogPost[])[0]
}

export async function updatePost(id: string, p: Partial<BlogInput>): Promise<BlogPost> {
  const res = await supabaseFetch(`/rest/v1/blog_posts?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(clean(p)),
  })
  if (!res.ok) throw new Error(await errorText(res, 'Could not save the post'))
  const rows = (await res.json()) as BlogPost[]
  if (!rows[0]) throw new Error('Not allowed (admin only).')
  return rows[0]
}

export async function deletePost(id: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/blog_posts?id=eq.${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorText(res, 'Could not delete the post'))
}

export async function deleteAllPosts(): Promise<void> {
  const res = await supabaseFetch('/rest/v1/blog_posts?id=not.is.null', { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorText(res, 'Could not delete the posts'))
}

export function fmtPostDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

/** Rough reading time at ~220 words per minute. */
export function readingMinutes(md: string): number {
  return Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 220))
}
