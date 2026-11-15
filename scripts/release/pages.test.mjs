import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { root as project, domain, configuration } from './build-static.mjs'

const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const run=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
async function fixture(mode='custom-domain') {
  await fs.mkdir(path.join(project,'.local'),{recursive:true})
  const directory=await fs.mkdtemp(path.join(project,'.local/pages-test-'))
  const root=path.join(directory,'work'),remote=path.join(directory,'remote.git')
  await fs.mkdir(path.join(root,'scripts/release'),{recursive:true})
  for(const name of ['prepare-pages.mjs','build-static.mjs']) await fs.copyFile(new URL(name,import.meta.url),path.join(root,'scripts/release',name))
  await fs.mkdir(path.join(root,'dist'))
  await fs.writeFile(path.join(root,'.gitignore'),'dist/\n.local/\n')
  await fs.writeFile(path.join(root,'game-source.mjs'),'source only')
  const git=(...args)=>run(root,...args)
  git('init','--initial-branch=main');git('config','user.name','Release Tool Test');git('config','user.email','release-tool@example.invalid')
  git('remote','add','origin','https://github.com/zhuiguang49/LastHarbor-Departure.git')
  run(directory,'init','--bare',remote)
  git('config',`url.file://${remote}.insteadOf`,'https://github.com/zhuiguang49/LastHarbor-Departure.git')
  git('add','.');git('commit','-m','Fixture source')
  const prepare=(...args)=>spawnSync(process.execPath,['scripts/release/prepare-pages.mjs',...args],{cwd:root,encoding:'utf8'})
  const publishLocally=()=>run(directory,'--git-dir',remote,'fetch',root,'refs/heads/gh-pages:refs/heads/gh-pages')
  async function build(mode='custom-domain',text='first static version') {
    await fs.rm(path.join(root,'dist'),{recursive:true,force:true});await fs.mkdir(path.join(root,'dist'))
    const files=[]
    const content={'index.html':text,'campaign/index.html':text,'last-harbor-night/index.html':text,'local/night.mjs':'export const game = true',
      '.nojekyll':'','CREDITS.md':'Credits','THIRD_PARTY_NOTICES.md':'Third-party notices','LICENSE':'Project license','NOTICE':'Project notice'}
    if(mode==='custom-domain') content.CNAME=domain+'\n'
    for(const [name,text] of Object.entries(content)) {
      await fs.mkdir(path.dirname(path.join(root,'dist',name)),{recursive:true})
      await fs.writeFile(path.join(root,'dist',name),text)
      const bytes=Buffer.from(text);files.push({path:name,bytes:bytes.length,sha256:digest(bytes)})
    }
    const bytes=await fs.readFile(path.join(root,'game-source.mjs'))
    await fs.writeFile(path.join(root,'dist/release-manifest.json'),JSON.stringify({schema:2,...configuration(mode),entry:'campaign-m5-c',files,
      inputs:[{path:'game-source.mjs',bytes:bytes.length,sha256:digest(bytes)}]}))
  }
  async function remoteCommit() {
    const clone=path.join(directory,'github-ui')
    run(directory,'clone','--branch','gh-pages',remote,clone)
    run(clone,'config','user.name','Pages Settings Test');run(clone,'config','user.email','pages-settings@example.invalid')
    await fs.writeFile(path.join(clone,'CNAME'),domain+'\n')
    await fs.appendFile(path.join(clone,'index.html'),'\nremote change')
    run(clone,'add','.');run(clone,'commit','-m','Simulate GitHub Pages domain configuration')
    run(directory,'--git-dir',remote,'fetch',clone,'refs/heads/gh-pages:refs/heads/gh-pages')
    return run(clone,'rev-parse','HEAD')
  }
  await build(mode)
  return {root,directory,remote,git,prepare,build,publishLocally,remoteCommit,cleanup:()=>fs.rm(directory,{recursive:true,force:true})}
}
const passed=result=>assert.equal(result.status,0,result.stderr || result.stdout)
const rejected=(result,pattern)=>{assert.notEqual(result.status,0,result.stdout);assert.match(result.stderr,pattern)}

test('Pages preparation keeps a static-only orphan history, CNAME, main and its index; repeated packages are idempotent', async () => {
  const f=await fixture()
  try {
    const main=f.git('rev-parse','HEAD'),index=f.git('write-tree')
    passed(f.prepare('--dry-run'));assert.equal(f.git('branch','--list','gh-pages'),'')
    passed(f.prepare());const first=f.git('rev-parse','gh-pages')
    assert.equal(f.git('show','gh-pages:CNAME'),domain)
    assert.equal(f.git('rev-list','--count','gh-pages'),'1')
    assert.equal(f.git('ls-tree','--name-only','gh-pages').includes('scripts'),false)
    assert.equal(f.git('ls-tree','--name-only','gh-pages').includes('game-source.mjs'),false)
    passed(f.prepare());assert.equal(f.git('rev-parse','gh-pages'),first)
    await f.build('custom-domain','second static version')
    passed(f.prepare());assert.equal(f.git('rev-parse','gh-pages^'),first)
    assert.equal(f.git('show','gh-pages:index.html'),'second static version')
    f.publishLocally();passed(f.prepare());assert.equal(JSON.parse(f.prepare('--dry-run').stdout).relation,'local matches remote')
    assert.equal(f.git('rev-parse','HEAD'),main);assert.equal(f.git('branch','--show-current'),'main')
    assert.equal(f.git('write-tree'),index);assert.equal(f.git('status','--porcelain'),'')
    // Identity may fall back to the source commit without writing Git configuration.
    f.git('config','--unset','user.name');f.git('config','--unset','user.email')
    await f.build('custom-domain','third static version');passed(f.prepare())
  } finally {await f.cleanup()}
})

test('remote Pages settings commits become parents and CNAME survives subsequent releases', async () => {
  const f=await fixture('project')
  try {
    passed(f.prepare());f.publishLocally()
    const old=f.git('rev-parse','gh-pages'),remote=await f.remoteCommit()
    rejected(f.prepare(),/Existing gh-pages has CNAME/)
    assert.equal(f.git('rev-parse','gh-pages'),old)
    await f.build();passed(f.prepare())
    assert.equal(f.git('rev-parse','gh-pages^'),remote)
    assert.equal(f.git('show','gh-pages:CNAME'),domain)
    assert.equal(f.git('merge-base','--is-ancestor',remote,'gh-pages'),'')
    await f.build('project');rejected(f.prepare(),/preserve the domain/)
  } finally {await f.cleanup()}
})

test('divergent remote history is rejected without changing local gh-pages', async () => {
  const f=await fixture()
  try {
    passed(f.prepare());f.publishLocally()
    const old=f.git('rev-parse','gh-pages')
    await f.remoteCommit()
    const tree=f.git('rev-parse','gh-pages^{tree}')
    const local=f.git('commit-tree',tree,'-p',old,'-m','Local independent commit')
    f.git('update-ref','refs/heads/gh-pages',local,old)
    rejected(f.prepare(),/histories diverged/);assert.equal(f.git('rev-parse','gh-pages'),local)
  } finally {await f.cleanup()}
})

test('dirty main can be inspected but cannot prepare; branch, repository and stale inputs are checked', async () => {
  const f=await fixture()
  try {
    await fs.writeFile(path.join(f.root,'unreviewed.txt'),'new source')
    const preview=f.prepare('--dry-run');passed(preview);assert.equal(JSON.parse(preview.stdout).ready,false)
    rejected(f.prepare(),/Commit reviewed source/);assert.equal(f.git('branch','--list','gh-pages'),'')
    await fs.rm(path.join(f.root,'unreviewed.txt'))
    f.git('switch','-c','topic');rejected(f.prepare(),/from main/);f.git('switch','main')
    f.git('remote','set-url','origin','https://example.invalid/other.git');rejected(f.prepare(),/Origin must target/)
    f.git('remote','set-url','origin','https://github.com/zhuiguang49/LastHarbor-Departure.git')
    await fs.writeFile(path.join(f.root,'game-source.mjs'),'changed source');f.git('add','.');f.git('commit','-m','Source update')
    rejected(f.prepare(),/Stale build input/)
  } finally {await f.cleanup()}
})

test('tampered files, extra files, unsafe paths and incorrect CNAME cannot enter Pages', async () => {
  const f=await fixture()
  try {
    await fs.appendFile(path.join(f.root,'dist/index.html'),'tampered');rejected(f.prepare(),/integrity mismatch/)
    await f.build();await fs.writeFile(path.join(f.root,'dist/AGENTS.md'),'private');rejected(f.prepare(),/file list differs/)
    await f.build();await fs.writeFile(path.join(f.root,'dist/CNAME'),'other.example\n');rejected(f.prepare(),/integrity mismatch/)
    await f.build();const file=path.join(f.root,'dist/release-manifest.json'),manifest=JSON.parse(await fs.readFile(file))
    manifest.files[0].path='../escape';await fs.writeFile(file,JSON.stringify(manifest));rejected(f.prepare(),/Invalid manifest record/)
    await f.build();await fs.symlink(path.join(f.root,'game-source.mjs'),path.join(f.root,'dist/leak.mjs'));rejected(f.prepare(),/Symlinks/)
    await f.build('local');rejected(f.prepare(),/build:pages/)
  } finally {await f.cleanup()}
})
