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
export async function buildStatic(base = '/', output = path.join(root, 'dist')) {
  base = normalizeBase(base)
  if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw Error('Output must be this release project’s dist/')
  const source = await fs.readFile(path.join(root, '.local/last-harbor/night.html'), 'utf8')
  await fs.rm(output, { recursive: true, force: true })
  await fs.mkdir(path.join(output, 'last-harbor-night'), { recursive: true })
  await fs.mkdir(path.join(output, 'local'), { recursive: true })
  // Preserve gameplay; adapt resource URLs and omit the development cover note.
  await fs.writeFile(path.join(output, 'last-harbor-night/index.html'), rebase(source, base).replace('<head>', '<head><link rel="icon" href="data:,">'))
  const names = await fs.readdir(path.join(root, 'scripts/harbor'))
  for (const name of names.filter(name => name.endsWith('.mjs') && !name.includes('check') && !name.startsWith('convert-') && name !== 'build-night.mjs')) {
    await fs.writeFile(path.join(output, 'local', name), rebase(await fs.readFile(path.join(root, 'scripts/harbor', name), 'utf8'), base))
  }
  // Only browser-consumed resources are published. Source GLBs/CAD stay on main for maintenance.
  for (const file of await filesAt(path.join(root, 'assets'))) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    if (!(/\.(mjs|jpg|ogg)$/.test(file) || /\/(infected\/丧尸|soldier\/soldier|维修柜\/维修柜)\.glb$/.test(relative))) continue
    const target = path.join(output, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(file, target)
  }
  const entries = { '':'campaign-m5-c', campaign:'campaign-m5-c', 'legacy-sandbox':'legacy-sandbox' }
  for (const entry of ['campaign-m0','campaign-m1','campaign-m2','campaign-m3','campaign-m3-a0','campaign-m3-a1','campaign-m3-a2','campaign-m4-a0','campaign-m4-a1','campaign-m4','campaign-m5-a0','campaign-m5-a1','campaign-m5-b','campaign-m5-c']) entries[entry] = entry
  for (const [route, entry] of Object.entries(entries)) {
    const target = path.join(output, route, 'index.html')
    await fs.mkdir(path.dirname(target), { recursive: true })
    const destination = base + 'last-harbor-night/'
    await fs.writeFile(target, `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Last Harbor: Departure</title><script>const u=new URL(${JSON.stringify(destination)},location.origin);u.search=location.search;u.searchParams.set('entry',${JSON.stringify(entry)});u.searchParams.set('play','1');location.replace(u)</script><a href="${destination}?entry=${entry}&play=1">进入游戏 / Play</a>\n`)
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
