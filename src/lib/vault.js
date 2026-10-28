// Loads the Obsidian vault bundled under /content/vault.
// Later this folder is replaced by a GitHub sync of the live vault; the app code doesn't change.
import { marked } from 'marked'

const files = import.meta.glob('/content/vault/**/*.md', { query: '?raw', import: 'default', eager: true })

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    else v = v.replace(/^"|"$/g, '')
    meta[k] = v
  }
  return { meta, body: raw.slice(m[0].length) }
}

export const notes = Object.entries(files).map(([path, raw]) => {
  const rel = path.replace('/content/vault/', '')
  const folder = rel.includes('/') ? rel.split('/')[0] : ''
  const title = rel.split('/').pop().replace(/\.md$/, '')
  const { meta, body } = parseFrontmatter(raw)
  const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : [])
  const links = [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map(x => x[1].trim())
  return { path: rel, folder, title, meta, body, tags, links, slug: slugify(title) }
}).sort((a, b) => a.path.localeCompare(b.path))

export function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }

const byTitle = new Map(notes.map(n => [n.title.toLowerCase(), n]))
export const findNote = (title) => byTitle.get(String(title).toLowerCase())
export const noteBySlug = (slug) => notes.find(n => n.slug === slug)
export const backlinksOf = (note) => notes.filter(n => n !== note && n.links.some(l => l.toLowerCase() === note.title.toLowerCase()))
export const folders = [...new Set(notes.map(n => n.folder))].filter(Boolean).sort()

// Obsidian → HTML: wikilinks, callouts, tasks
export function render(note) {
  let src = note.body
  // callouts: > [!type] Title  (+ following quote lines)
  src = src.replace(/^> \[!(\w+)\]\s*(.*)$((?:\n> ?.*)*)/gm, (_m, type, title, rest) => {
    const body = rest.split('\n').map(l => l.replace(/^> ?/, '')).join('\n').trim()
    const gold = /quote|example|success|kpi/i.test(type)
    return `<div class="callout ${gold ? 'gold' : ''}"><div class="ct">${title || type}</div>\n\n${body}\n\n</div>`
  })
  // wikilinks
  src = src.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, target, label) => {
    const n = findNote(target.trim())
    const text = label || target.trim()
    return n ? `<a class="wikilink" href="#/playbook/${n.slug}">${text}</a>` : `<a class="wikilink missing">${text}</a>`
  })
  // #tags (not headings): leave in place as pills
  src = src.replace(/(^|\s)#([a-zA-Z][\w-]*)/g, (m, pre, tag) => `${pre}<span class="pill pink">#${tag}</span>`)
  return marked.parse(src, { gfm: true, breaks: false })
}

export const sops = () => notes.filter(n => n.tags.includes('sop') && !/template/i.test(n.title))
export const inFolder = (prefix) => notes.filter(n => n.folder.startsWith(prefix))
