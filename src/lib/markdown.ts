/**
 * v64: tiny, safe Markdown → HTML for blog posts. Everything is HTML-escaped first, then a small subset is turned
 * into tags: # / ## / ### headings, paragraphs, - and 1. lists, > quotes, ---, **bold**, *italic*, `code`,
 * [links](https://… or /#/…) and ![images](https://…). No raw HTML is ever passed through.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function safeUrl(u: string): string | null {
  const url = u.trim().replace(/&amp;/g, '&')
  if (/^https?:\/\//i.test(url) || /^\/(#\/)?[\w\-/?=&.#%]*$/.test(url) || /^#\//.test(url) || /^mailto:|^tel:/i.test(url)) return url
  return null
}

function inline(s: string): string {
  let out = esc(s)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => {
    const url = safeUrl(u)
    return url && /^https?:/i.test(url) ? `<img src="${esc(url)}" alt="${alt}" loading="lazy" />` : m
  })
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, u) => {
    const url = safeUrl(u)
    if (!url) return text
    const ext = /^https?:/i.test(url) && !/listingneeded\.com/i.test(url)
    return `<a href="${esc(url)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`
  })
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  return out
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []
  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`)
    quote = []
  }
  const flushAll = () => {
    flushPara()
    flushList()
    flushQuote()
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    let m: RegExpMatchArray | null
    if (!line.trim()) {
      flushAll()
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll()
      const level = m[1].length === 3 ? 3 : 2 // "#" and "##" → h2, "###" → h3 (the page title is the only h1)
      html.push(`<h${level}>${inline(m[2])}</h${level}>`)
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushAll()
      html.push('<hr />')
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara()
      flushQuote()
      if (!list || list.tag !== 'ul') {
        flushList()
        list = { tag: 'ul', items: [] }
      }
      list.items.push(m[1])
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara()
      flushQuote()
      if (!list || list.tag !== 'ol') {
        flushList()
        list = { tag: 'ol', items: [] }
      }
      list.items.push(m[1])
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara()
      flushList()
      quote.push(m[1])
    } else if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ' ' + line.trim()
    } else {
      flushList()
      flushQuote()
      para.push(line.trim())
    }
  }
  flushAll()
  return html.join('\n')
}

/** Plain text (for meta descriptions / previews). */
export function markdownToText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
