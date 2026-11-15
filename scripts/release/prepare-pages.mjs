import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { root, domain, validateRelease } from './build-static.mjs'

const args = process.argv.slice(2)
if (args.some(arg=>arg!=='--dry-run') || args.length>1) throw Error('Usage: npm run pages:prepare -- [--dry-run]')
const dryRun = args.includes('--dry-run')
const env = {...process.env,GIT_TERMINAL_PROMPT:'0',GIT_SSH_COMMAND:process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes -o ConnectTimeout=15'}
const git = (args,options={}) => execFileSync('git',['-c','core.quotepath=false',...args],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],...options}).trim()
const optional = args => {
  const result = spawnSync('git',args,{cwd:root,env,encoding:'utf8'})
  if (result.status===1 || result.status===128 && /unknown revision|not a valid ref|Needed a single revision/.test(result.stderr)) return null
  if (result.status!==0) throw Error(result.stderr || 'Git command failed')
  return result.stdout.trim()
}
const ancestor = (a,b) => {
  const result=spawnSync('git',['merge-base','--is-ancestor',a,b],{cwd:root,env,encoding:'utf8'})
  if (result.status>1 || result.status===null) throw Error(result.stderr || 'Cannot compare branch history')
  return result.status===0
}
const target = /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)zhuiguang49\/LastHarbor-Departure(?:\.git)?\/?$/
if (git(['rev-parse','--show-toplevel']) !== root) throw Error('Requires the independent release repository')
if (git(['branch','--show-current']) !== 'main') throw Error('Prepare pages from main')
if (!target.test(git(['config','--get','remote.origin.url']))) throw Error('Origin must target zhuiguang49/LastHarbor-Departure')
const pushURLs=optional(['config','--get-all','remote.origin.pushurl'])
if (pushURLs && pushURLs.split('\n').some(url=>!target.test(url))) throw Error('Origin push URL must target zhuiguang49/LastHarbor-Departure')
const status = git(['status','--porcelain'])
if (status && !dryRun) throw Error('Commit reviewed source changes before preparing gh-pages; use --dry-run to inspect first')
const summary = await validateRelease(path.join(root,'dist'),{checkInputs:true})
const manifest = summary.manifest
if (!['custom-domain','project'].includes(manifest.mode)) throw Error('Use npm run build:pages or npm run build:pages:project before preparing Pages')
const main = git(['rev-parse','HEAD'])
const local = optional(['rev-parse','--verify','refs/heads/gh-pages'])
const remoteTip = () => {
  const lines=git(['ls-remote','--heads','origin','refs/heads/gh-pages'])
  if (!lines) return null
  if (!/^[a-f0-9]{40}\s+refs\/heads\/gh-pages$/.test(lines)) throw Error('Unexpected remote gh-pages reference')
  return lines.split(/\s/)[0]
}
const remote=remoteTip()
if (remote) {
  git(['fetch','--no-tags','origin','refs/heads/gh-pages'])
  if (git(['rev-parse','FETCH_HEAD'])!==remote) throw Error('Remote gh-pages changed during inspection; rerun preparation')
}
let parent=local || remote, relation='new branch'
if (local && remote) {
  if (local===remote) relation='local matches remote'
  else if (ancestor(local,remote)) { parent=remote;relation='remote ahead; preserve its commits' }
  else if (ancestor(remote,local)) relation='local ahead of remote'
  else throw Error('Local and remote gh-pages histories diverged. No branch updated; resolve the conflict explicitly before publishing')
} else if (remote) relation='adopt remote history'
else if (local) relation='local branch; remote absent'
if (parent) {
  if (optional(['merge-base',main,parent])) throw Error('gh-pages shares source history with main; refuse to publish source history')
  const priorFiles=git(['ls-tree','-r','--name-only',parent]).split('\n')
  if (priorFiles.includes('CNAME')) {
    const previousDomain=git(['show',`${parent}:CNAME`])
    if (manifest.mode!=='custom-domain') throw Error('Existing gh-pages has CNAME. Rebuild with npm run build:pages to preserve the domain; project builds are preview-only while the domain is configured')
    if (previousDomain!==domain) throw Error('Existing gh-pages CNAME uses another domain. No branch updated; review the domain change explicitly')
  }
}
const plan={dryRun,ready:!status,repository:'zhuiguang49/LastHarbor-Departure',sourceBranch:'main',sourceCommit:main,
  sourceStatus:status ? 'uncommitted changes; commit reviewed source before preparation' : 'clean',
  mode:manifest.mode,base:manifest.base,customDomain:manifest.customDomain,files:summary.files,bytes:summary.bytes,
  duplicateGroups:summary.duplicates,local,remote,parent,relation,push:false}
if (dryRun) {
  console.log(JSON.stringify(plan,null,2))
} else {
  await fs.mkdir(path.join(root,'.local'),{recursive:true})
  const directory=await fs.mkdtemp(path.join(root,'.local/pages-'))
  try {
    const indexEnv={...env,GIT_INDEX_FILE:path.join(directory,'index')}
    git(['read-tree','--empty'],{env:indexEnv})
    git(['--work-tree',path.join(root,'dist'),'-C',path.join(root,'dist'),'add','--all','--force','--','.'],{env:indexEnv})
    const tree=git(['write-tree'],{env:indexEnv})
    const expected=[...manifest.files.map(file=>file.path),'release-manifest.json'].sort()
    if (JSON.stringify(git(['ls-tree','-r','--name-only',tree]).split('\n').sort())!==JSON.stringify(expected)) throw Error('Staged Pages tree differs from the verified release')
    let commit=parent
    if (!parent || git(['rev-parse',`${parent}^{tree}`])!==tree) {
      const name=optional(['config','user.name']) || git(['show','-s','--format=%an',main])
      const email=optional(['config','user.email']) || git(['show','-s','--format=%ae',main])
      commit=git(['-c',`user.name=${name}`,'-c',`user.email=${email}`,'commit-tree',tree,...(parent ? ['-p',parent] : []),'-m',`Build Pages from ${main.slice(0,12)} (${manifest.mode})`])
    }
    if (remoteTip()!==remote) throw Error('Remote gh-pages changed during preparation; no local branch updated. Rerun preparation')
    if (git(['rev-parse','HEAD'])!==main || git(['status','--porcelain'])!==status) throw Error('Source state changed during preparation; no branch updated')
    git(['update-ref','refs/heads/gh-pages',commit,local || '0'.repeat(40)])
    console.log(JSON.stringify({...plan,commit,unchanged:commit===local},null,2))
    console.log('Local gh-pages prepared. No checkout, push or deployment performed.')
  } finally { await fs.rm(directory,{recursive:true,force:true}) }
}
