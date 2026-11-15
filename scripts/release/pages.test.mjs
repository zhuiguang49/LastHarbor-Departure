import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('Pages preparation writes only a repeatable local static branch and preserves main', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lastharbor-pages-test-'))
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
  const prepare=()=>spawnSync(process.execPath,['scripts/release/prepare-pages.mjs'],{cwd:root,encoding:'utf8'})
  try {
    await fs.mkdir(path.join(root,'scripts/release'),{recursive:true})
    for(const name of ['prepare-pages.mjs','build-static.mjs']) await fs.copyFile(new URL(name,import.meta.url),path.join(root,'scripts/release',name))
    await fs.mkdir(path.join(root,'dist'))
    await fs.writeFile(path.join(root,'dist/release-manifest.json'),JSON.stringify({base:'/LastHarbor-Departure/'}))
    await fs.writeFile(path.join(root,'dist/index.html'),'first static version')
    await fs.writeFile(path.join(root,'.gitignore'),'dist/\n')
    await fs.writeFile(path.join(root,'game-source.mjs'),'source only')
    git('init','--initial-branch=main');git('config','user.name','Release Tool Test');git('config','user.email','release-tool@example.invalid')
    git('remote','add','origin','https://example.invalid/never-push.git')
    git('add','.');git('commit','-m','Fixture source')
    const main=git('rev-parse','HEAD')
    let result=prepare();assert.equal(result.status,0,result.stderr)
    const first=git('rev-parse','gh-pages')
    assert.equal(git('show','gh-pages:index.html'),'first static version')
    assert.deepEqual(git('ls-tree','--name-only','gh-pages').split('\n').sort(),['index.html','release-manifest.json'])
    await fs.writeFile(path.join(root,'dist/index.html'),'second static version')
    result=prepare();assert.equal(result.status,0,result.stderr)
    assert.equal(git('rev-parse','gh-pages^'),first)
    assert.equal(git('show','gh-pages:index.html'),'second static version')
    assert.equal(git('rev-parse','HEAD'),main);assert.equal(git('branch','--show-current'),'main');assert.equal(git('status','--porcelain'),'')
    await fs.writeFile(path.join(root,'game-source.mjs'),'unreviewed change')
    result=prepare();assert.notEqual(result.status,0);assert.match(result.stderr,/Commit reviewed source/)
  } finally { await fs.rm(root,{recursive:true,force:true}) }
})
