// Bundles the Obsidian vault into one JSON file the AI assistant function can read.
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..', 'content', 'vault')
const docs = []
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) { if (!f.startsWith('.')) walk(p) }
    else if (f.endsWith('.md')) {
      const raw = fs.readFileSync(p, 'utf8').replace(/^---\n[\s\S]*?\n---\n?/, '')
      docs.push({ title: f.replace(/\.md$/, ''), path: path.relative(root, p).replace(/\\/g, '/'), body: raw.trim() })
    }
  }
}
if (fs.existsSync(root)) walk(root)
fs.mkdirSync(path.join(__dirname, '..', 'netlify', 'functions'), { recursive: true })
fs.writeFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'vault-content.json'), JSON.stringify({ builtAt: new Date().toISOString(), docs }))
console.log(`vault bundled: ${docs.length} docs`)
