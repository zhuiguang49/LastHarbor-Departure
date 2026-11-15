import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import { root, domain, projectBase, normalizeBase, rebase, configuration, validateRelease } from './build-static.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const dist = path.join(root, 'dist')

test('static artifact has verified hashes and resolves every literal browser import under the configured mount', async () => {
  const {manifest} = await validateRelease(dist,{checkInputs:true})
  const base = normalizeBase(manifest.base)
  const files = new Set(manifest.files.map(f=>f.path))
  assert.ok(files.has('campaign/index.html'))
  assert.ok(files.has('index.html'))
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
})

test('subpath conversion changes URL roots and preserves the remaining source', () => {
  const code = "import { a } from '../../assets/harbor/a.mjs'; fetch('/assets/harbor/a.ogg'); import('./sibling.mjs'); const x=`/local/night.mjs`"
  assert.equal(rebase(code,'/LastHarbor-Departure/'),"import { a } from '/LastHarbor-Departure/assets/harbor/a.mjs'; fetch('/LastHarbor-Departure/assets/harbor/a.ogg'); import('./sibling.mjs'); const x=`/LastHarbor-Departure/local/night.mjs`")
  for (const invalid of ['https://example.com/','/../','/path','//','/a?b/']) assert.throws(()=>normalizeBase(invalid))
  assert.equal(normalizeBase('/LastHarbor-Departure/'),'/LastHarbor-Departure/')
})

test('release excludes historical routes and isolated trial modules', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(dist,'release-manifest.json')))
  const files = manifest.files.map(file=>file.path)
  const pages = files.filter(file=>file==='index.html' || file.endsWith('/index.html')).sort()
  assert.deepEqual(pages,['campaign/index.html','index.html','last-harbor-night/index.html'])
  for (const name of ['character-lab','character-behavior-lab','campaign-m3-a0','campaign-m3-a1','campaign-m3-a2','campaign-m4-a0','campaign-m4-a1']) {
    assert.ok(!files.includes(`local/${name}.mjs`),name)
  }
  const night = await fs.readFile(path.join(dist,'local/night.mjs'),'utf8')
  assert.ok(!/characterLab|infectedLab|installCampaignM3A|installCampaignM4A/.test(night))
  assert.ok(!night.includes("get('start')"))
})

test('every public entry forces the full campaign before game startup', async () => {
  const queries = ['', '?entry=legacy-sandbox&play=0', '?entry=campaign-m1&characterLab=1',
    '?entry=campaign-m3-a1&start=chapter3', '?entry=campaign-m5-c&start=chapter5&infectedLab=1&infectedSection=ch2.s1&legacy=1&light=neutral&aftermath=0',
    '?entry=campaign-m0&entry=campaign-m4-a1&%73tart=chapter4&q=low&seed=4207']
  for (const file of ['index.html','campaign/index.html','last-harbor-night/index.html']) {
    const html = await fs.readFile(path.join(dist,file),'utf8')
    const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1]
    for (const query of queries) {
      let result
      const location = new URL('https://example.com/'+file+query)
      location.replace = value => { result = new URL(value) }
      const history = { replaceState:(_state,_title,value) => { result = new URL(value) } }
      vm.runInNewContext(script,{URL,location,history},{timeout:1000})
      assert.equal(result.searchParams.get('entry'),'campaign-m5-c',file+query)
      assert.equal(result.searchParams.getAll('entry').length,1)
      assert.equal(result.searchParams.get('play'),'1')
      for (const key of ['start','characterLab','infectedLab','infectedSection','legacy','light','aftermath']) assert.equal(result.searchParams.has(key),false,key)
      if (query.includes('q=low')) { assert.equal(result.searchParams.get('q'),'low'); assert.equal(result.searchParams.get('seed'),'4207') }
    }
  }
})

test('formal bootstrap loads all chapter resources with every trial disabled', async () => {
  const source=await fs.readFile(path.join(root,'scripts/harbor/night.mjs'),'utf8')
  const boot=source.slice(source.indexOf('// The release always installs'))
  let options,warmed=false,started=false
  const equipment={},asset={},bank={},chapter3={assets:{}},chapter4={},repair={}
  const node={children:[],querySelector(){return this},insertAdjacentHTML(){},remove(){},style:{}}
  const g={game:{menus:{root:node}}},T={},settings={}
  const modules={
    './equipment.mjs':{installEquipment:(_g,options)=>{assert.equal(options.campaignProbe,true);assert.equal(options.campaignM2,true);return equipment}},
    './infrastructure.mjs':{installInfrastructure:()=>({})},'./reinforcements.mjs':{installReinforcements:()=>({})},
    './opening-narrative.mjs':{installNarrative:(_g,_e,options)=>{assert.equal(options.chapter3Available,true);assert.equal(options.chapter4Available,true);assert.equal(options.chapter5Available,true);return {}}},
    './aftermath.mjs':{installAftermath:()=>({})},'./campaign-pickup-asset.mjs':{createPickupModel(){},loadPickupTexture:async()=>({})},
    './character-assets.mjs':{loadInfectedAsset:async()=>asset},'./character-audio.mjs':{loadInfectedAudio:async()=>bank},
    './campaign-ch3-runtime.mjs':{loadChapter3RuntimeResources:async()=>chapter3},'./campaign-ch3-environment.mjs':{buildChapter3Environment(){}},
    './campaign-ch4-assets.mjs':{loadChapter4Assets:async()=>chapter4},'./campaign-ch4-environment.mjs':{buildChapter4Environment(){}},
    './campaign-ch5-repair-asset.mjs':{loadChapter5RepairAsset:async()=>repair},
    './campaign-m2.mjs':{installCampaignM2:(_g,_e,value)=>{options=value;return {chapter5:{battle:{warmup(){warmed=true}}}}}},
  }
  const window={__lastHarborPendingStart:()=>{started=true}}
  const document={documentElement:{classList:{remove(){}}},getElementById:()=>node}
  await vm.runInNewContext(`(async()=>{${boot.replaceAll('import(','load(')}})()`,{g,T,window,document,settings,lamps:[],mesh(){},lamp(){},load:async name=>{assert.ok(modules[name],name);return modules[name]}})
  for (const flag of ['chapter4Available','chapter5Available','chapter5Combat','chapter5Fuel','chapter5Ending']) assert.equal(options[flag],true,flag)
  for (const flag of ['chapter3Trial','chapter4Trial','chapter5Trial']) assert.equal(options[flag],false,flag)
  assert.equal(options.chapter3Resources,chapter3);assert.equal(options.repairResources,repair)
  assert.equal(options.infected.asset,asset);assert.equal(options.infected.bank,bank)
  assert.equal(g.campaignAssets.chapter4,chapter4);assert.equal(warmed,true);assert.equal(started,true)
})


test('deployment configurations keep the root domain and project mount separate', async () => {
  assert.deepEqual(configuration('custom-domain'),{mode:'custom-domain',base:'/',customDomain:domain})
  assert.deepEqual(configuration('project'),{mode:'project',base:projectBase,customDomain:null})
  assert.deepEqual(configuration('local'),{mode:'local',base:'/',customDomain:null})
  assert.throws(()=>configuration('custom-domain',projectBase),/requires base/)
  assert.throws(()=>configuration('project','/'),/requires base/)
  assert.throws(()=>configuration('unknown'),/Unknown build mode/)
  const {manifest}=await validateRelease(dist)
  const cname=manifest.files.find(file=>file.path==='CNAME')
  if(manifest.mode==='custom-domain') {
    assert.ok(cname)
    assert.equal(await fs.readFile(path.join(dist,'CNAME'),'utf8'),domain+'\n')
    for(const file of manifest.files.filter(file=>/\.(mjs|html)$/.test(file.path))) {
      assert.ok(!(await fs.readFile(path.join(dist,file.path),'utf8')).includes(projectBase),file.path)
    }
  } else assert.equal(cname,undefined)
})
