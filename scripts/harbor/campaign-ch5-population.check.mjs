import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeChapter5Fixture } from './campaign-ch5-warehouse.check.mjs'
import { CH5_QUOTAS, CH5_INFECTED_AREAS, CH5_GROUND_SITES, CH5_AIR_SITES, createChapter5Navigation,
  createChapter5SpawnSelector } from './campaign-ch5-spawns.mjs'
import { createChapter5Population } from './campaign-ch5-population.mjs'

const json=value=>JSON.parse(JSON.stringify(value))
const quotas={infected:7,soldier:5,hound:3,gull:3},total=18
const randomFor=initial=>{let n=initial;return()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296)}
const dimensions=kind=>({radius:kind==='hound'||kind==='gull'?.65:.4,height:kind==='gull'?1:kind==='hound'?1.4:1.8})

function fixture(){
  const f=nativeChapter5Fixture(),{g,T}=f,v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
  g.player={pos:v(-38,0,0),eye:v(-38,1.68,0),forward:v(1,0,0),alive:true,enabled:true}
  g.game={state:'playing',run:{retries:0}};g.params={seed:4207};g.camera={fov:75,aspect:16/9}
  const navigation=createChapter5Navigation(g),owned=new Map(),spawned=[],retired=[]
  let narrative=false,failSpawn=false
  const active=()=>g.game.state==='playing'&&g.player.alive&&g.player.enabled&&!narrative
  // Explicit actor/factory ports: only population and real world placement are
  // under test here. Native combat, GLBs and GPU resources have separate checks.
  const actors=()=>[...owned.values()].filter(a=>a.alive&&a.active).map(actor=>({actor,kind:actor.kind,
    collider:{position:actor.pos.clone().add(v(0,actor.kind==='gull'?-.5:0,0)),...dimensions(actor.kind)}}))
  const population=createChapter5Population(g,{active,actors,navigation,
    spawn(slot,position,yaw){
      if(failSpawn)return null
      const actor={id:slot.id,kind:slot.kind,pos:position.clone(),yaw,alive:true,active:true,
        hp:slot.kind==='infected'?200:slot.kind==='soldier'?100:slot.kind==='hound'?140:45}
      owned.set(slot.id,actor);spawned.push({id:slot.id,actor});return actor
    },retire(slot){retired.push(slot.actor);slot.actor.alive=false;slot.actor.active=false;owned.delete(slot.id)}})
  return {...f,v,navigation,population,actors,owned,spawned,retired,
    player(x,y,z){g.player.pos.set(x,y,z);g.player.eye.set(x,y+1.68,z)},
    narrative(value){narrative=value},failSpawn(value){failSpawn=value},
    selector(random=randomFor(7)){return createChapter5SpawnSelector(g,{actors,random,navigation})},
    kill(id){const a=owned.get(id);assert.ok(a?.alive);a.alive=false;a.active=false;a.hp=0},
    tick(dt){population.update(dt);const s=population.snapshot()
      assert.equal(s.slots.length,total);assert.equal(new Set(s.slots.map(s=>s.id)).size,total)
      for(const [kind,count]of Object.entries(s.counts))assert.ok(count.alive+count.reserved<=quotas[kind],`${kind} exceeded its quota`)
      assert.ok(actors().length<=total);return s},
    dispose(){population.dispose();assert.equal(owned.size,0)
      const geometries=new Set(),materials=new Set()
      g.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)})
      for(const geometry of geometries)geometry.dispose()
      for(const material of materials)material.dispose()
      g.scene.clear()}}
}
const assertFull=f=>{
  const snapshot=f.population.snapshot()
  for(const [kind,count]of Object.entries(quotas))assert.deepEqual(snapshot.counts[kind],{alive:count,reserved:0})
  assert.equal(f.actors().length,total)
  for(const event of snapshot.history.filter(e=>e.type==='spawn'))assert.ok(event.playerDistance>5)
  for(const [id,sites]of Object.entries(CH5_INFECTED_AREAS)){
    const slot=snapshot.slots.find(s=>s.id===id)
    assert.ok(sites.some(s=>s.id===slot.lastSite),`${id} must spawn in its assigned coast-side area`)
  }
}

test('three additional infected retain distinct coast-side areas; blocked areas wait instead of falling back to the warehouse',()=>{
  const f=fixture()
  try{
    const selector=f.selector(randomFor(24))
    for(const [id,sites]of Object.entries(CH5_INFECTED_AREAS)){
      assert.ok(sites.length>=3)
      const draws=[]
      for(let n=0;n<12;n++){
        const choice=selector.select('infected',draws.at(-1),id)
        assert.ok(choice);assert.ok(sites.some(s=>s.id===choice.site));assert.ok(choice.playerDistance>5)
        draws.push(choice.site)
      }
      assert.ok(new Set(draws).size>1)
      const blocks=sites.map(s=>f.g.physics.addBox([s.x-.5,0,s.z-.5],[s.x+.5,2,s.z+.5],{tag:'regional-site-blocked'}))
      assert.equal(selector.select('infected',null,id),null,'no out-of-area fallback')
      for(const box of blocks)f.g.physics.removeBox(box)
      for(const site of sites){f.player(site.x,0,site.z);assert.equal(selector.validate('infected',site),null)}
      f.player(-38,0,0)
    }
    const boat=CH5_INFECTED_AREAS['ch5-infected-5']
    assert.ok(boat.every(s=>s.x>=18&&s.z>=10))
    for(const id of ['ch5-infected-6','ch5-infected-7'])assert.ok(CH5_INFECTED_AREAS[id].every(s=>s.z>=16&&s.x<=12))
    const blocker=f.g.physics.addBox([17,0,9],[29,3,29],{tag:'boat-area-blocked'})
    f.population.start();f.tick(.02)
    assert.equal(f.population.snapshot().slots.find(s=>s.id==='ch5-infected-5').alive,false)
    assert.equal(f.population.snapshot().slots.find(s=>s.id==='ch5-infected-5').due,0)
    f.g.physics.removeBox(blocker);f.tick(.5);assertFull(f)
  }finally{f.dispose()}
})

test('CH5 authored ground and air sites pass the actual native Berth 7 volumes/navigation with both shutters closed',t=>{
  const f=fixture()
  try{
    assert.deepEqual(CH5_QUOTAS,quotas);assert.equal(f.shutters.snapshot().phase,'closed')
    const selector=f.selector(),counts={}
    for(const kind of Object.keys(quotas)){
      const sites=kind==='gull'?CH5_AIR_SITES:CH5_GROUND_SITES
      for(const site of sites){
        const result=selector.validate(kind,site)
        assert.ok(result,`${kind}/${site.id} must be genuinely usable`)
        assert.ok(result.playerDistance>5);assert.equal(f.g.physics.nav.isWalkable(site.x,site.z),true)
      }
      counts[kind]=sites.length
    }
    // Doors remain real obstacles, and inaccessible interior destinations do
    // not receive the native nav's substituted endpoint as a valid route.
    const door={id:'south-door',x:-3.5,y:0,z:-11.16},inside={id:'inside-warehouse',x:-3.5,y:.03,z:-12.5}
    assert.equal(selector.validate('soldier',door),null)
    assert.equal(selector.validate('soldier',inside),null)
    f.shutters.start();f.shutters.update(4)
    assert.ok(selector.validate('soldier',inside));assert.equal(f.shutters.snapshot().phase,'open')
    t.diagnostic(JSON.stringify({nativeBoxes:f.g.physics.boxes.length,verifiedSites:counts}))
  }finally{f.dispose()}
})

test('CH5 rejects exactly five metres, overlapping bodies, world solids and outside-sector points',()=>{
  const f=fixture()
  try{
    const selector=f.selector(),site=CH5_GROUND_SITES[0]
    f.player(site.x+5,0,site.z)
    assert.equal(selector.validate('soldier',site),null,'distance exactly 5m is forbidden')
    f.player(site.x+5.0001,0,site.z)
    assert.ok(selector.validate('soldier',site),'strictly greater than 5m is permitted when otherwise safe')
    f.player(-38,0,0)
    const blocker={id:'occupied',kind:'infected',pos:f.v(site.x,0,site.z),alive:true,active:true}
    f.owned.set(blocker.id,blocker)
    assert.equal(selector.validate('soldier',site),null,'other live actors occupy their full capsule')
    blocker.pos.y=4;assert.ok(selector.validate('soldier',site),'separate vertical volumes may coexist')
    f.owned.delete(blocker.id)
    const box=f.g.physics.addBox([site.x-.2,0,site.z-.2],[site.x+.2,2,site.z+.2],{tag:'spawn-solid'})
    assert.equal(selector.validate('infected',site),null,'actual world box rejects a spawn even before nav rebuild')
    f.g.physics.removeBox(box)
    assert.equal(selector.validate('soldier',{id:'outside',x:-40,y:0,z:0}),null)
    for(const kind of Object.keys(quotas)){
      const candidate=kind==='gull'?CH5_AIR_SITES[0]:site
      f.player(candidate.x+5,0,candidate.z)
      assert.equal(selector.validate(kind,candidate),null,`${kind} must never use height to evade horizontal safety distance`)
    }
  }finally{f.dispose()}
})

test('CH5 drone flight checks the swept body above ground nav, including an obstacle missed by its centre ray',()=>{
  const f=fixture()
  try{
    const selector=f.selector(),site=CH5_AIR_SITES[0],from=f.v(site.x,site.y,site.z),to=f.v(8,7,12)
    assert.ok(selector.validate('gull',site));assert.equal(selector.flight(from,to),true)
    const mid=from.clone().lerp(to,.5)
    const box=f.g.physics.addBox([mid.x-.1,mid.y+.35,mid.z-.1],[mid.x+.1,mid.y+.55,mid.z+.1],{tag:'drone-overhead-obstacle'})
    f.g.physics.build()
    assert.equal(f.g.physics.nav.isWalkable(site.x,site.z),true)
    assert.equal(selector.volume(from.clone().add(f.v(0,-.5,0)),.65,1),true)
    assert.equal(f.g.physics.lineOfSight(from,to),true,'centre ray remains clear')
    assert.equal(selector.flight(from,to),false,'drone body intersects overhead obstacle')
    assert.equal(selector.validate('gull',site),null)
    f.g.physics.removeBox(box);f.g.physics.build();assert.ok(selector.validate('gull',site))
  }finally{f.dispose()}
})

test('CH5 random selection prefers unseen sites beyond eight metres and varies the legal site draw',()=>{
  const f=fixture()
  try{
    for(const kind of Object.keys(quotas)){
      const selector=f.selector(randomFor(42)),picked=[]
      for(let i=0;i<16;i++){
        const choice=selector.select(kind,picked.at(-1))
        assert.ok(choice);assert.equal(choice.preferred,true);assert.equal(choice.inView,false);assert.ok(choice.playerDistance>8)
        assert.notEqual(choice.site,picked.at(-1));picked.push(choice.site)
      }
      assert.ok(new Set(picked).size>2,`${kind} must not always use one location`)
      const other=f.selector(randomFor(99)),alternate=Array.from({length:16},()=>other.select(kind,null).site)
      assert.notDeepEqual(picked,alternate)
    }
  }finally{f.dispose()}
})

test('CH5 unsafe or unavailable spawns remain reserved and retry without force-spawning or exceeding quotas',()=>{
  const f=fixture()
  try{
    const box=f.g.physics.addBox([-39,0,-29],[29,20,29],{tag:'all-sites-blocked'});f.g.physics.build()
    assert.equal(f.population.start(),true);assert.equal(f.population.start(),false)
    let snapshot=f.tick(10)
    assert.equal(f.spawned.length,0)
    for(const [kind,count]of Object.entries(quotas))assert.deepEqual(snapshot.counts[kind],{alive:0,reserved:count})
    f.g.physics.removeBox(box);f.g.physics.build()
    f.tick(.49);assert.equal(f.spawned.length,0,'failed safety check delays reattempt')
    f.failSpawn(true);f.tick(.01);assert.equal(f.spawned.length,0)
    f.failSpawn(false);f.tick(.49);assert.equal(f.spawned.length,0,'factory refusal also retains its reservation')
    f.tick(.01);assertFull(f);assert.equal(f.spawned.length,total)
    f.population.start();f.tick(20);assertFull(f);assert.equal(f.spawned.length,total)
  }finally{f.dispose()}
})

test('CH5 vacancies use independent five-second simulation clocks and freeze for pause, narrative and death',()=>{
  const f=fixture()
  try{
    f.population.start();f.tick(.02);assertFull(f)
    const unchanged=new Map(f.owned)
    f.kill('ch5-infected-1');let snapshot=f.tick(.02)
    const infectedDue=snapshot.slots.find(s=>s.id==='ch5-infected-1').due
    assert.equal(infectedDue,snapshot.elapsed+5)
    f.tick(1);f.kill('ch5-hound-1');snapshot=f.tick(.02)
    const houndDue=snapshot.slots.find(s=>s.id==='ch5-hound-1').due
    assert.ok(houndDue>infectedDue)
    assert.deepEqual(snapshot.counts.infected,{alive:6,reserved:1});assert.deepEqual(snapshot.counts.hound,{alive:2,reserved:1})
    const before=json(snapshot)
    f.g.game.state='paused';f.tick(20);assert.deepEqual(json(f.population.snapshot()),before)
    f.g.game.state='playing';f.narrative(true);f.tick(20);assert.deepEqual(json(f.population.snapshot()),before)
    f.narrative(false);f.g.player.alive=false;f.tick(20);assert.deepEqual(json(f.population.snapshot()),before)
    f.g.player.alive=true
    f.tick(infectedDue-f.population.capture().elapsed-.001);assert.equal(f.spawned.length,total)
    snapshot=f.tick(.001);assert.equal(f.spawned.length,total+1)
    assert.deepEqual(snapshot.counts.infected,{alive:7,reserved:0});assert.deepEqual(snapshot.counts.hound,{alive:2,reserved:1})
    f.tick(houndDue-f.population.capture().elapsed-.001);assert.equal(f.spawned.length,total+1)
    f.tick(.001);assert.equal(f.spawned.length,total+2);assertFull(f)
    for(const [id,actor]of unchanged)if(!['ch5-infected-1','ch5-hound-1'].includes(id))assert.equal(f.owned.get(id),actor)
  }finally{f.dispose()}
})

test('CH5 paused soldier active flags never create a vacancy or shorten the next real death delay',()=>{
  const f=fixture()
  try{
    f.population.start();f.tick(.02);assertFull(f)
    const soldiers=[...f.owned.values()].filter(a=>a.kind==='soldier')
    f.g.game.state='paused';for(const actor of soldiers)actor.active=false
    f.tick(20)
    f.g.game.state='playing'
    // The population runs before the soldier controller re-enables its targets.
    let snapshot=f.tick(.02)
    assert.deepEqual(snapshot.counts.soldier,{alive:5,reserved:0})
    assert.ok(snapshot.slots.filter(s=>s.kind==='soldier').every(s=>s.due===null))
    for(const actor of soldiers)actor.active=true
    snapshot=f.tick(6);assertFull(f);assert.equal(f.spawned.length,total)
    assert.equal(snapshot.history.filter(e=>e.type==='vacancy').length,0)
    f.kill('ch5-soldier-1');snapshot=f.tick(.02)
    const due=snapshot.slots.find(s=>s.id==='ch5-soldier-1').due
    assert.equal(due,snapshot.elapsed+5)
    f.tick(4.999);assert.equal(f.spawned.length,total)
    snapshot=f.tick(.001);assert.equal(f.spawned.length,total+1);assertFull(f)
    const replacement=snapshot.slots.find(s=>s.id==='ch5-soldier-1')
    assert.equal(replacement.generation,2);assert.equal(replacement.hp,100)
  }finally{f.dispose()}
})

test('CH5 a reused native object with a different actor id cannot satisfy its old slot generation',()=>{
  const f=fixture()
  let actor,originalId
  try{
    f.population.start();f.tick(.02);assertFull(f)
    actor=f.owned.get('ch5-hound-1');originalId=actor.id
    actor.id='reused-native-generation';actor.alive=true;actor.active=true
    const snapshot=f.tick(.02),old=snapshot.slots.find(s=>s.id===originalId)
    assert.equal(old.actorId,originalId);assert.equal(old.alive,false);assert.equal(old.hp,0)
    assert.equal(old.due,snapshot.elapsed+5);assert.deepEqual(snapshot.counts.hound,{alive:2,reserved:1})
    assert.equal(f.spawned.length,total)
    f.tick(4.999);assert.equal(f.spawned.length,total)
  }finally{
    // This port tests identity accounting only; native generation-safe release
    // has its own test. Restore the dummy identity before its fixture cleanup.
    if(actor)actor.id=originalId
    f.dispose()
  }
})

test('CH5 all eighteen fixed slots survive repeated replacement cycles and reset/start remains idempotent',t=>{
  const f=fixture()
  try{
    const fixedSlots=[...f.population.slots],sites=new Map(fixedSlots.map(s=>[s.id,new Set()]))
    f.population.start();f.tick(.02);assertFull(f)
    for(let round=0;round<4;round++){
      for(const slot of f.population.slots){sites.get(slot.id).add(slot.lastSite);f.kill(slot.id)}
      let snapshot=f.tick(.02)
      for(const [kind,count]of Object.entries(quotas))assert.deepEqual(snapshot.counts[kind],{alive:0,reserved:count})
      const count=f.spawned.length;f.tick(4.999);assert.equal(f.spawned.length,count)
      f.tick(.001);assert.equal(f.spawned.length,count+total);assertFull(f)
      for(const [i,slot]of f.population.slots.entries())assert.equal(slot,fixedSlots[i],'slot identities remain fixed')
    }
    for(const used of sites.values())assert.ok(used.size>1)
    assert.equal(f.spawned.length,total*5);assert.equal(f.retired.length,total*4)
    f.population.reset();assert.equal(f.owned.size,0);assert.deepEqual(f.population.capture(),{started:false,elapsed:0})
    const retirementCount=f.retired.length;f.population.reset();assert.equal(f.retired.length,retirementCount)
    for(const slot of f.population.snapshot().slots){assert.equal(slot.due,null);assert.equal(slot.generation,0);assert.equal(slot.lastSite,null)}
    f.tick(100);assert.equal(f.spawned.length,total*5)
    assert.equal(f.population.start(),true);assert.equal(f.population.start(),false);f.tick(.02);assertFull(f)
    f.population.dispose();assert.equal(f.owned.size,0);assert.equal(f.population.start(),false)
    f.tick(100);assert.equal(f.spawned.length,total*6)
    t.diagnostic(JSON.stringify({replacementRounds:4,totalSpawnCalls:total*6,fixedSlots:total,uniqueSitesPerSlot:[...sites].map(([id,s])=>({id,count:s.size}))}))
  }finally{f.dispose()}
})
