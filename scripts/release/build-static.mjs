import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
export const domain = 'lastharbor.zhuiguang.tech'
export const projectBase = '/LastHarbor-Departure/'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const notices = ['CREDITS.md','THIRD_PARTY_NOTICES.md','LICENSE','NOTICE']
export function normalizeBase(value = '/') {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) throw Error('Base must be / or /path/ using letters, numbers, - and _')
  return value
}
export function configuration(mode = 'local', base) {
  if (!['local','custom-domain','project'].includes(mode)) throw Error(`Unknown build mode: ${mode}`)
  const expected = mode === 'project' ? projectBase : '/'
  if (mode !== 'local' && base !== undefined && base !== expected) throw Error(`Mode ${mode} requires base ${expected}`)
  return {mode,base:normalizeBase(base ?? expected),customDomain:mode === 'custom-domain' ? domain : null}
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
const relative = (directory,file) => path.relative(directory,file).split(path.sep).join('/')
async function recordsFor(directory,files) {
  return Promise.all([...files].sort().map(async file => {
    const bytes = await fs.readFile(file)
    return {path:relative(directory,file),bytes:bytes.length,sha256:hash(bytes)}
  }))
}
export async function buildStatic(base = '/', output = path.join(root, 'dist'), mode = 'local') {
  const config = configuration(mode,base)
  base = config.base
  if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw Error('Output must be this release project’s dist/')
  const source = await fs.readFile(path.join(root, '.local/last-harbor/night.html'), 'utf8')
  const modules = await runtimeModules()
  const inputs = new Set([...modules.keys(),...notices.map(name=>path.join(root,name)),
    ...['package.json','package-lock.json','scripts/release/build-static.mjs','scripts/harbor/build-night.mjs','几猫国产3A大作_V1-fable5.2.html'].map(name=>path.join(root,name))])
  await fs.rm(output, { recursive: true, force: true })
  await fs.mkdir(path.join(output, 'last-harbor-night'), { recursive: true })
  await fs.mkdir(path.join(output, 'local'), { recursive: true })
  const policy = `(${configureCampaignURL.toString()})`
  const bootstrap = `<script>{const u=${policy}(new URL(location.href));history.replaceState(null,'',u)}</script>`
  await fs.writeFile(path.join(output, 'last-harbor-night/index.html'), rebase(source, base).replace('<head>', '<head><link rel="icon" href="data:,">'+bootstrap))
  for (const [file,code] of modules) {
    const name = relative(root,file)
    const destination = name.startsWith('scripts/harbor/') ? 'local/'+path.basename(file) : name
    const target = path.join(output,destination)
    await fs.mkdir(path.dirname(target),{recursive:true})
    await fs.writeFile(target,rebase(code,base))
  }
  // Only browser-consumed resources are published. Source GLBs/CAD stay on main for maintenance.
  for (const file of await filesAt(path.join(root, 'assets'))) {
    const name = relative(root,file)
    if (!(/\.(jpg|ogg)$/.test(file) || /\/(infected\/丧尸|soldier\/soldier|维修柜\/维修柜)\.glb$/.test(name))) continue
    const target = path.join(output, name)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(file, target)
    inputs.add(file)
  }
  for (const route of ['', 'campaign']) {
    const target = path.join(output, route, 'index.html')
    await fs.mkdir(path.dirname(target), { recursive: true })
    const destination = base + 'last-harbor-night/'
    await fs.writeFile(target, `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Last Harbor: Departure</title><script>const u=new URL(${JSON.stringify(destination)},location.origin);u.search=location.search;${policy}(u);location.replace(u)</script><a href="${destination}?entry=campaign-m5-c&play=1">进入游戏 / Play</a>\n`)
  }
  await fs.writeFile(path.join(output, '.nojekyll'), '')
  if (config.customDomain) await fs.writeFile(path.join(output,'CNAME'),config.customDomain+'\n')
  for (const name of notices) await fs.copyFile(path.join(root, name), path.join(output, name))
  const files = await recordsFor(output,await filesAt(output))
  await fs.writeFile(path.join(output, 'release-manifest.json'), JSON.stringify({schema:2,...config,entry:'campaign-m5-c',files,inputs:await recordsFor(root,inputs)},null,2)+'\n')
  const summary = await validateRelease(output)
  console.log(`Static release: ${summary.files} files, ${(summary.bytes/1024/1024).toFixed(2)} MiB, mode ${config.mode}, base ${base}`)
  console.log(`Full campaign: ${base}campaign/; duplicate nonempty file groups: ${summary.duplicates.length}`)
}
const safePath = name => typeof name === 'string' && name.length && !name.includes('\\') && !name.split('/').some(part=>!part || part==='.' || part==='..') && !path.isAbsolute(name)
const publicFile = name => ['index.html','campaign/index.html','last-harbor-night/index.html','.nojekyll','CNAME',...notices].includes(name) ||
  (/^local\/[\w-]+\.mjs$/.test(name) && !/check|test|lab/.test(path.basename(name))) ||
  (/^assets\//.test(name) && /\.(mjs|jpg|ogg|glb)$/.test(name) && !/provenance|\.check\.|\.test\./.test(name))
export async function validateRelease(directory = path.join(root,'dist'), {checkInputs = false} = {}) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory,'release-manifest.json'),'utf8'))
  if (manifest.schema !== 2 || manifest.entry !== 'campaign-m5-c') throw Error('Unsupported release manifest or campaign entry; rebuild the static package')
  const config = configuration(manifest.mode,manifest.base)
  if (manifest.customDomain !== config.customDomain) throw Error('Manifest custom domain does not match its mode')
  for (const field of ['files','inputs']) {
    if (!Array.isArray(manifest[field]) || !manifest[field].length) throw Error(`Manifest lacks ${field}`)
    const seen = new Set()
    for (const record of manifest[field]) {
      if (!safePath(record.path) || seen.has(record.path) || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256)) throw Error(`Invalid manifest record: ${record.path}`)
      seen.add(record.path)
      if (field === 'files' && !publicFile(record.path)) throw Error(`Not a public runtime file: ${record.path}`)
      if (field === 'inputs' && !checkInputs) continue
      const file = path.join(field === 'files' ? directory : root,record.path)
      const stat = await fs.lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`Not a regular release file: ${record.path}`)
      const bytes = await fs.readFile(file)
      if (bytes.length !== record.bytes || hash(bytes) !== record.sha256) throw Error(`${field === 'inputs' ? 'Stale build input' : 'Release integrity mismatch'}: ${record.path}`)
    }
  }
  const expected = manifest.files.map(record=>record.path).sort()
  const actual = (await filesAt(directory)).map(file=>relative(directory,file)).filter(name=>name!=='release-manifest.json')
  if (JSON.stringify(expected)!==JSON.stringify(actual)) throw Error('Release file list differs from the manifest')
  for (const name of ['index.html','campaign/index.html','last-harbor-night/index.html','local/night.mjs','.nojekyll',...notices]) {
    if (!expected.includes(name)) throw Error(`Missing release file: ${name}`)
  }
  if ((await fs.readFile(path.join(directory,'.nojekyll'))).length) throw Error('.nojekyll must be empty')
  if (config.customDomain) {
    if (!expected.includes('CNAME') || await fs.readFile(path.join(directory,'CNAME'),'utf8') !== domain+'\n') throw Error('CNAME must contain only the configured custom domain')
  } else if (expected.includes('CNAME')) throw Error('Only the custom-domain build may contain CNAME')
  const grouped = new Map()
  for (const record of manifest.files.filter(record=>record.bytes)) {
    const group = grouped.get(record.sha256) || []
    group.push(record.path);grouped.set(record.sha256,group)
  }
  return {manifest,files:actual.length+1,bytes:(await fs.stat(path.join(directory,'release-manifest.json'))).size+manifest.files.reduce((n,file)=>n+file.bytes,0),duplicates:[...grouped.values()].filter(group=>group.length>1)}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let mode,base
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--mode=') && mode===undefined) mode=arg.slice(7)
    else if (arg.startsWith('--base=') && base===undefined) base=arg.slice(7)
    else throw Error('Usage: node scripts/release/build-static.mjs [--mode=custom-domain|project|local] [--base=/path/]')
  }
  if (!mode) { base ??= process.env.LASTHARBOR_BASE || '/';mode = base===projectBase ? 'project' : 'local' }
  const config = configuration(mode,base)
  await buildStatic(config.base,path.join(root,'dist'),config.mode)
}
