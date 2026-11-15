import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { parse } from '@babel/parser'
import { root, normalizeBase, rebase } from './build-static.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const dist = path.join(root, 'dist')

test('static artifact has verified hashes and resolves every literal browser import under the configured mount', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(dist,'release-manifest.json')))
  const base = normalizeBase(manifest.base)
  const files = new Set(manifest.files.map(f=>f.path))
  assert.ok(files.has('campaign/index.html'))
  assert.ok(files.has('index.html'))
  assert.ok(files.has('legacy-sandbox/index.html'))
  assert.ok(files.has('campaign-m0/index.html'))
  assert.ok(files.has('campaign-m1/index.html'))
  assert.ok(![...files].some(f=>/check\.mjs|\.STEP$|provenance|docs\/|AGENTS|source-before|\.git\//.test(f)))
  assert.equal([...files].filter(f=>f.endsWith('.ogg')).length,16)
  assert.equal([...files].filter(f=>f.endsWith('.glb')).length,3)
  for (const record of manifest.files) {
    const bytes = await fs.readFile(path.join(dist,record.path))
    assert.equal(hash(bytes),record.sha256,record.path)
    if (!record.path.endsWith('.mjs')) continue
    const code = bytes.toString()
    assert.ok(!code.includes('/Users/'),record.path)
    parse(code,{sourceType:'module'})
    for (const match of code.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
      const specifier = match[2]
      assert.ok(specifier.startsWith('.') || specifier.startsWith(base),`${record.path}: external import ${specifier}`)
      const resolved = specifier.startsWith('/') ? specifier.slice(base.length) : path.posix.normalize(path.posix.join(path.posix.dirname(record.path),specifier))
      assert.ok(files.has(resolved),`${record.path}: unresolved ${specifier} -> ${resolved}`)
    }
  }
  const html = await fs.readFile(path.join(dist,'last-harbor-night/index.html'),'utf8')
  assert.ok(html.includes(`src="${base}local/night.mjs"`))
  assert.ok((await fs.readFile(path.join(dist,'index.html'),'utf8')).includes("'campaign-m5-c'".replaceAll("'",'"')))
})

test('subpath conversion changes URL roots and preserves the remaining source', () => {
  const code = "import { a } from '../../assets/harbor/a.mjs'; fetch('/assets/harbor/a.ogg'); import('./sibling.mjs'); const x=`/local/night.mjs`"
  assert.equal(rebase(code,'/LastHarbor-Departure/'),"import { a } from '/LastHarbor-Departure/assets/harbor/a.mjs'; fetch('/LastHarbor-Departure/assets/harbor/a.ogg'); import('./sibling.mjs'); const x=`/LastHarbor-Departure/local/night.mjs`")
  for (const invalid of ['https://example.com/','/../','/path','//','/a?b/']) assert.throws(()=>normalizeBase(invalid))
  assert.equal(normalizeBase('/LastHarbor-Departure/'),'/LastHarbor-Departure/')
})
