import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { root, filesAt } from './build-static.mjs'

// Explicitly local preparation. Publishing is a separate user action.
const git = args => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()
if (git(['rev-parse','--show-toplevel']) !== root.replace(/\/$/,'')) throw Error('Requires the independent release repository')
if (git(['branch','--show-current']) !== 'main') throw Error('Prepare pages from main')
if (git(['status','--porcelain'])) throw Error('Commit reviewed source changes before preparing gh-pages')
const manifest = JSON.parse(await fs.readFile(path.join(root,'dist/release-manifest.json')))
if (manifest.base !== '/LastHarbor-Departure/') throw Error('Build with LASTHARBOR_BASE=/LastHarbor-Departure/ first')
const hash = git(['rev-parse','HEAD'])
let previous
try { previous = git(['rev-parse','--verify','refs/heads/gh-pages']) } catch {}
const directory = await fs.mkdtemp(path.join(os.tmpdir(),'lastharbor-pages-'))
try {
  const files = await filesAt(path.join(root,'dist'))
  for (const file of files) {
    const relative = path.relative(path.join(root,'dist'),file)
    await fs.mkdir(path.dirname(path.join(directory,relative)),{recursive:true})
    await fs.copyFile(file,path.join(directory,relative))
  }
  execFileSync('git',['init','--initial-branch=gh-pages'],{cwd:directory,stdio:'pipe'})
  if (previous) {
    execFileSync('git',['fetch',root,'refs/heads/gh-pages'],{cwd:directory,stdio:'pipe'})
    execFileSync('git',['update-ref','refs/heads/gh-pages',previous],{cwd:directory})
  }
  for (const key of ['user.name','user.email']) {
    const value = git(['config',key])
    if (!value) throw Error(`Configure ${key} in the release repository first`)
    execFileSync('git',['config',key,value],{cwd:directory})
  }
  execFileSync('git',['add','--all'],{cwd:directory})
  execFileSync('git',['commit','--allow-empty','-m',`Build Pages from ${hash.slice(0,12)}`],{cwd:directory,stdio:'pipe'})
  // Import locally and update the branch only if its previous value still matches.
  const commit = execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8'}).trim()
  git(['fetch',directory,commit])
  git(['update-ref','refs/heads/gh-pages',commit,previous || '0000000000000000000000000000000000000000'])
  console.log(`Prepared local gh-pages ${commit} from main ${hash}. No push performed.`)
} finally { await fs.rm(directory,{recursive:true,force:true}) }
