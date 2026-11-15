import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
export function normalizeBase(value = '/') {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) throw Error('Base must be / or /path/ using letters, numbers, - and _')
  return value
}
export function rebase(text, base) {
  return text.replace(/(['"`])(\.\.\/\.\.\/assets\/|\/assets\/|\/local\/)/g,
    (_, quote, prefix) => quote + base + (prefix.includes('assets') ? 'assets/' : 'local/'))
}
export async function filesAt(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const all = await Promise.all(entries.map(async entry => {
    const name = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw Error(`Symlinks are not release inputs: ${name}`)
    return entry.isDirectory() ? filesAt(name) : [name]
  }))
  return all.flat().sort()
}
export function configureCampaignURL(url) {
  for (const key of ['start','characterLab','infectedLab','infectedSection','legacy','light','aftermath']) url.searchParams.delete(key)
  url.searchParams.set('entry','campaign-m5-c')
  url.searchParams.set('play','1')
  return url
}
async function runtimeModules() {
  const modules = new Map(), pending = [path.join(root,'scripts/harbor/night.mjs')]
  while (pending.length) {
    const file = pending.pop()
    if (modules.has(file)) continue
    const relative = path.relative(root,file).split(path.sep).join('/')
    if (!relative.startsWith('scripts/harbor/') && !relative.startsWith('assets/')) throw Error(`Unexpected runtime module: ${relative}`)
    const code = await fs.readFile(file,'utf8')
    modules.set(file,code)
    for (const match of code.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
      if (!match[2].startsWith('.')) throw Error(`Unexpected runtime import: ${match[2]}`)
      pending.push(path.resolve(path.dirname(file),match[2]))
    }
  }
  return modules
}
export async function buildStatic(base = '/', output = path.join(root, 'dist')) {
  base = normalizeBase(base)
  if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw Error('Output must be this release project’s dist/')
  const source = await fs.readFile(path.join(root, '.local/last-harbor/night.html'), 'utf8')
  await fs.rm(output, { recursive: true, force: true })
  await fs.mkdir(path.join(output, 'last-harbor-night'), { recursive: true })
  await fs.mkdir(path.join(output, 'local'), { recursive: true })
  const policy = `(${configureCampaignURL.toString()})`
  const bootstrap = `<script>{const u=${policy}(new URL(location.href));history.replaceState(null,'',u)}</script>`
  await fs.writeFile(path.join(output, 'last-harbor-night/index.html'), rebase(source, base).replace('<head>', '<head><link rel="icon" href="data:,">'+bootstrap))
  for (const [file,code] of await runtimeModules()) {
    const relative = path.relative(root,file).split(path.sep).join('/')
    const destination = relative.startsWith('scripts/harbor/') ? 'local/'+path.basename(file) : relative
    const target = path.join(output,destination)
    await fs.mkdir(path.dirname(target),{recursive:true})
    await fs.writeFile(target,rebase(code,base))
  }
  // Only browser-consumed resources are published. Source GLBs/CAD stay on main for maintenance.
  for (const file of await filesAt(path.join(root, 'assets'))) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    if (!(/\.(jpg|ogg)$/.test(file) || /\/(infected\/丧尸|soldier\/soldier|维修柜\/维修柜)\.glb$/.test(relative))) continue
    const target = path.join(output, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(file, target)
  }
  for (const route of ['', 'campaign']) {
    const target = path.join(output, route, 'index.html')
    await fs.mkdir(path.dirname(target), { recursive: true })
    const destination = base + 'last-harbor-night/'
    await fs.writeFile(target, `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Last Harbor: Departure</title><script>const u=new URL(${JSON.stringify(destination)},location.origin);u.search=location.search;${policy}(u);location.replace(u)</script><a href="${destination}?entry=campaign-m5-c&play=1">进入游戏 / Play</a>\n`)
  }
  await fs.writeFile(path.join(output, '.nojekyll'), '')
  for (const name of ['CREDITS.md','THIRD_PARTY_NOTICES.md']) await fs.copyFile(path.join(root, name), path.join(output, name))
  const records = []
  for (const file of await filesAt(output)) {
    const bytes = await fs.readFile(file)
    records.push({ path: path.relative(output,file).split(path.sep).join('/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  await fs.writeFile(path.join(output, 'release-manifest.json'), JSON.stringify({schema:1,base,entry:'campaign-m5-c',files:records},null,2)+'\n')
  console.log(`Static release: ${records.length} files, base ${base}, full campaign at ${base}campaign/`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length && !(args.length === 1 && args[0].startsWith('--base='))) throw Error('Usage: node scripts/release/build-static.mjs [--base=/path/]')
  await buildStatic(args[0]?.slice(7) || process.env.LASTHARBOR_BASE || '/')
}
