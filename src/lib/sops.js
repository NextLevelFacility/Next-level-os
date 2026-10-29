// The SOP list: every numbered SOP inside the vault's department pages (03 - SOPs & Standards),
// merged with rewrites + videos saved in the app (sop_docs). The vault stays the outline; the app holds the finished version.
import { useEffect, useState } from 'react'
import { notes, slugify } from './vault'
import { supabase, isManager } from './supabase'

const DEPT_FOLDER = '03 - SOPs & Standards'
const DEFAULT_ROLES = [
  [/coaching/, ['coach']],
  [/member-experience/, ['frontdesk', 'sales']],
  [/sales/, ['sales']],
  [/facility|operations/, ['frontdesk', 'coach']],
  [/marketing|brand/, ['sales', 'operator']],
  [/finance|admin/, ['operator']],
]
const rolesForTags = (tags) => { for (const [re, r] of DEFAULT_ROLES) if (tags.some(t => re.test(t))) return r; return ['operator'] }

export const departments = () => notes.filter(n => n.folder === DEPT_FOLDER && !/index|template/i.test(n.title))

// Split a department page into its "### 1. Title" sections.
export function vaultSops() {
  const out = []
  for (const dept of departments()) {
    const lines = dept.body.split('\n')
    let cur = null
    for (const line of lines) {
      const h = line.match(/^###\s+(?:(\d+)[.)]\s*)?(.+?)\s*$/)
      if (h) {
        if (cur) out.push(cur)
        const title = h[2].replace(/\*[^*]*\*/g, '').replace(/[*_`]/g, '').trim()
        cur = { key: `${dept.slug}#${slugify(title)}`, dept: dept.title, deptSlug: dept.slug, n: Number(h[1]) || out.filter(s => s.dept === dept.title).length + 1, title, outline: '', roles: rolesForTags(dept.tags) }
        continue
      }
      if (/^##\s/.test(line)) { if (cur) out.push(cur); cur = null; continue }
      if (cur) cur.outline += line + '\n'
    }
    if (cur) out.push(cur)
  }
  return out.map(s => ({ ...s, outline: s.outline.trim(), status: 'outline', body: null, video_url: null }))
}

// Vault outlines + app docs, one list. Docs the vault doesn't know (custom SOPs) are appended under their department.
export function mergeSops(docs) {
  const base = vaultSops()
  const byKey = new Map(base.map(s => [s.key, s]))
  for (const d of docs || []) {
    const v = byKey.get(d.key)
    const dept = d.dept || v?.dept || 'Other'
    byKey.set(d.key, { ...(v || { key: d.key, dept, deptSlug: slugify(dept), n: 99, outline: '', custom: true }), ...d, dept, title: d.title || v?.title, roles: d.roles?.length ? d.roles : (v?.roles || []), doc: d })
  }
  return [...byKey.values()].sort((a, b) => a.dept.localeCompare(b.dept) || (a.sort || 0) - (b.sort || 0) || a.n - b.n)
}

export function useSops() {
  const [docs, setDocs] = useState(null)
  const load = async () => { const { data } = await supabase.from('sop_docs').select('*'); setDocs(data || []) }
  useEffect(() => { load() }, [])
  return { sops: mergeSops(docs || []), docs, loading: docs == null, reload: load }
}

export const sopFor = (sops, roles) => {
  const list = Array.isArray(roles) ? roles : [roles]
  if (isManager(list)) return sops
  return sops.filter(s => s.roles.some(r => list.includes(r)) || (list.includes('director') && s.roles.includes('coach')))
}
export const isLive = (s) => s.status === 'published'
export const STATUS = { outline: ['Outline', ''], draft: ['Draft', 'gold'], published: ['Live', 'good'] }
