import assert from 'node:assert/strict'
import { test,after } from 'node:test'
import { nativeChapter5Fixture } from './campaign-ch5-warehouse.check.mjs'
import { capsulePath,navPath } from './campaign-ch2.check.mjs'
import { installChapter5Ammo,CH5_REUSABLE_AMMO_SITES as sites,CH5_AMMO_COOLDOWN } from './campaign-ch5-ammo.mjs'

// Original harbor, crate, worklight, Three, capsule physics and nav. Input and
// equipment persistence are explicit ports; actual refill/cooldown logic runs.
const f=nativeChapter5Fixture(),{T}=f,v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),point=p=>v(p.x,p.y,p.z)
const json=value=>JSON.parse(JSON.stringify(value))
// Measured user GLB footprint at its final audited placement, for joint spacing.
const cabinet=f.g.physics.addBox([-35.4511,0,11.7138],[-34.5489,1.8,12.2862],{tag:'repair-cabinet-footprint'})
f.g.physics.build()
after(()=>{f.g.physics.removeBox(cabinet)})
function fixture(){
  let held=false,pressed=false,narrativeActive=false,restores=0,builds=0
  const specs={rifle:{magSize:40,reserveCap:160},pistol:{magSize:12,reserveCap:48},knife:{magSize:0,reserveCap:0}}
  let kit={activeWeapon:'pistol',pickupEnabled:{rifle:false,pistol:false,knife:false},
    slots:{rifle:{owned:true,ammo:2,reserve:3},pistol:{owned:true,ammo:1,reserve:4},knife:{owned:true,ammo:0,reserve:0}}}
  const equipment={capture:()=>json(kit),snapshot:()=>({slots:Object.fromEntries(Object.entries(kit.slots).map(([id,s])=>[id,{...s,...specs[id]}]))}),
    restore(saved){restores++;kit=json(saved)}}
  const g={...f.g,physics:{...f.g.physics,build(){builds++;f.g.physics.build()}},game:{state:'playing'},time:{frame:1},
    input:{down:()=>held,pressed:()=>pressed},hud:{setPrompt(text){this.prompt=text}},
    player:{pos:v(),eye:v(),forward:v(),alive:true,enabled:true,health:73}}
  const commits=[],ammo=installChapter5Ammo(g,{equipment,narrative:{snapshot:()=>({active:narrativeActive})},
    onCheckpoint:event=>commits.push({event,state:json(ammo.capture()),equipment:equipment.capture()})})
  function at(site){const s=ammo.snapshot().sites.find(s=>s.id===site.id)
    g.player.pos.copy(point(site.approach));g.player.eye.copy(g.player.pos).y+=1.68;g.player.forward.copy(v(...s.target)).sub(g.player.pos).setY(0).normalize()}
  function frame(dt=0,down=false,edge=down){held=down;pressed=edge;g.time.frame++;ammo.update(dt);return ammo.interact()}
  const press=()=>{frame();return frame(0,true)}
  const spend=()=>{const s=equipment.capture();s.slots.rifle.ammo=1;s.slots.pistol.reserve=2;equipment.restore(s)}
  return {g,ammo,equipment,commits,specs,at,frame,press,spend,setNarrative:value=>{narrativeActive=value},
    restores:()=>restores,builds:()=>builds,cleanup:()=>ammo.dispose()}
}

test('M5-B two native crates remain outside the closed warehouse, reachable beside the repair cabinet and free of original props',t=>{
  const baseline=[...f.g.physics.boxes],a=fixture(),{g,ammo}=a
  try{
    assert.equal(CH5_AMMO_COOLDOWN,10);assert.equal(f.shutters.snapshot().phase,'closed');assert.equal(ammo.snapshot().sites.length,2)
    for(const site of sites){
      a.at(site);assert.equal(g.physics.nav.isWalkable(site.approach.x,site.approach.z),true)
      for(const height of [1.8,1.15]){
        const feet=g.player.pos.clone(),result=g.physics.moveCapsule(feet,v(),0,.32,height)
        assert.equal(result.hitWall,false);assert.equal(result.hitCeil,false);assert.ok(feet.distanceTo(g.player.pos)<1e-8)
      }
      const holder=g.scene.getObjectByName(site.id);holder.updateMatrixWorld(true)
      for(const prop of holder.children.filter(o=>o.userData.prop)){
        assert.ok(['crate_wood','floodlight_stand'].includes(prop.userData.prop))
        const bounds=new T.Box3().setFromObject(prop)
        for(const old of baseline){const size=bounds.clone().intersect(old).getSize(v());assert.ok(size.x*size.y*size.z<1e-6,`${site.id}: overlaps ${old.tag}`)}
      }
      const target=v(...ammo.snapshot().sites.find(s=>s.id===site.id).target)
      assert.equal(g.physics.lineOfSight(g.player.eye,target),true);assert.equal(ammo.interact(),true)
      assert.match(g.hud.prompt,/弹药补给可用.*E/)
      for(const [from,to]of [[site.route,site.approach],[site.approach,site.route]])navPath(g,from,to,site.id)
      capsulePath(g,[site.route,site.approach,site.route],site.id)
      navPath(g,{x:-32.25,y:0,z:5.75},site.approach,site.id+'/apron')
      const from=point(site.approach).setY(.68),dir=point(site.position).setY(.68).sub(from).normalize()
      assert.equal(g.physics.raycast(from,dir,3)?.box?.tag,site.id+':crate_wood')
      assert.ok(new T.Raycaster(from,dir,0,3).intersectObject(holder,true).length)
      const feet=point(site.approach);assert.equal(g.physics.moveCapsule(feet,dir.multiplyScalar(2),1,.32,1.8).hitWall,true)
    }
    const feet=v(-35,0,10.6);assert.equal(g.physics.nav.isWalkable(feet.x,feet.z),true)
    assert.equal(g.physics.moveCapsule(feet,v(),0,.32,1.8).hitWall,false)
    t.diagnostic(JSON.stringify({sites:ammo.snapshot().sites,colliders:ammo.snapshot().colliderCount,lightCount:ammo.snapshot().lightCount}))
  }finally{a.cleanup()}
})

test('M5-B stations refill owned magazines/reserves independently and each recovers after ten simulation seconds',()=>{
  const a=fixture(),{ammo,equipment,g}=a
  try{
    a.at(sites[0]);a.press();assert.equal(a.commits.length,1);assert.equal(a.commits[0].event.kind,'ch5-ammo')
    assert.deepEqual(equipment.capture().slots.rifle,{owned:true,ammo:40,reserve:160})
    assert.deepEqual(equipment.capture().slots.pistol,{owned:true,ammo:12,reserve:48})
    assert.equal(g.hud.prompt,'补给恢复中：10s')
    a.frame(3);a.spend();a.at(sites[1]);a.press()
    assert.deepEqual(ammo.capture().stations.map(s=>[s.cooldownRemaining,s.uses]),[[7,1],[10,1]])
    a.spend();a.at(sites[0]);a.press();assert.equal(equipment.capture().slots.rifle.ammo,1);assert.equal(g.hud.prompt,'补给恢复中：7s')
    a.frame(6.99);assert.equal(a.commits.length,2);assert.equal(g.hud.prompt,'补给恢复中：1s')
    a.frame(.01);a.press();assert.equal(a.commits.length,3)
    assert.deepEqual(ammo.capture().stations.map(s=>[Math.round(s.cooldownRemaining),s.uses]),[[10,2],[3,1]])
    assert.equal(equipment.capture().activeWeapon,'pistol');assert.equal(g.player.health,73)
  }finally{a.cleanup()}
})

test('M5-B full inventories and unowned weapons do not consume supplies or add weapons, HP or a fourth slot',()=>{
  const a=fixture(),{ammo,equipment}=a
  try{
    a.at(sites[0])
    for(const owned of [[],['rifle'],['pistol'],['rifle','pistol']]){
      const saved=equipment.capture()
      for(const id of ['rifle','pistol'])Object.assign(saved.slots[id],{owned:owned.includes(id),ammo:a.specs[id].magSize,reserve:a.specs[id].reserveCap})
      equipment.restore(saved);const count=a.restores();a.press()
      assert.deepEqual(equipment.capture(),saved);assert.equal(a.restores(),count)
      assert.ok(ammo.capture().stations.every(s=>s.uses===0&&s.cooldownRemaining===0))
    }
    const saved=equipment.capture();saved.slots.rifle.owned=false;saved.slots.rifle.ammo=3;saved.slots.pistol.reserve=47;equipment.restore(saved)
    a.press();const after=equipment.capture()
    assert.deepEqual(after.slots.rifle,saved.slots.rifle);assert.deepEqual(after.slots.knife,saved.slots.knife)
    assert.equal(after.slots.pistol.reserve,48);assert.deepEqual(Object.keys(after.slots),['rifle','pistol','knife'])
    assert.deepEqual(after.pickupEnabled,saved.pickupEnabled);assert.equal(a.g.player.health,73)
  }finally{a.cleanup()}
})

test('M5-B cooldown and E input freeze during pause, narrative, death and disabled control; invalid dt and duplicate frames cannot advance',()=>{
  const a=fixture(),{g,ammo}=a
  try{
    a.at(sites[0]);a.press();a.spend();const before=json(ammo.capture())
    for(const mode of ['paused','intro','narrative','dead','disabled']){
      if(['paused','intro'].includes(mode))g.game.state=mode
      if(mode==='narrative')a.setNarrative(true)
      if(mode==='dead')g.player.alive=false
      if(mode==='disabled')g.player.enabled=false
      assert.equal(a.frame(20,true),false);assert.deepEqual(ammo.capture(),before)
      g.game.state='playing';g.player.alive=g.player.enabled=true;a.setNarrative(false)
    }
    for(const dt of [undefined,NaN,Infinity,0,-1]){a.frame(dt);assert.deepEqual(ammo.capture(),before)}
    a.frame(1);const once=json(ammo.capture());ammo.update(1);assert.deepEqual(ammo.capture(),once)
    a.frame(9,true);assert.equal(a.commits.length,2)
    a.spend();a.frame(10,true);assert.equal(a.commits.length,2,'held E is not a new claim')
    a.press();assert.equal(a.commits.length,3)
  }finally{a.cleanup()}
})

test('M5-B proximity, facing and physical occlusion gate the reusable crate',()=>{
  const a=fixture(),{g,ammo}=a
  try{
    a.at(sites[1]);g.player.forward.negate();assert.equal(a.press(),false)
    a.at(sites[1]);g.player.pos.z+=3;g.player.eye.z+=3;assert.equal(a.press(),false)
    a.at(sites[1]);const target=v(...ammo.snapshot().sites[1].target),mid=g.player.eye.clone().lerp(target,.5)
    const box=g.physics.addBox(mid.clone().add(v(-.5,-1,-.1)),mid.clone().add(v(.5,1,.1)),{tag:'ammo-test-obstruction'})
    g.physics.build()
    try{assert.equal(g.physics.lineOfSight(g.player.eye,target),false);assert.equal(a.press(),false)}finally{g.physics.removeBox(box);g.physics.build()}
    a.press();assert.equal(a.commits.length,1);ammo.interact();assert.equal(a.commits.length,1)
  }finally{a.cleanup()}
})

test('M5-B validates independent cooldown/uses atomically, restores detached JSON and resets both stations with inventory',()=>{
  const a=fixture(),{ammo,equipment}=a
  try{
    const entry=equipment.capture();a.at(sites[0]);a.press();a.frame(3);a.spend();a.at(sites[1]);a.press()
    const saved=json(ammo.capture()),kit=equipment.capture(),count=a.commits.length
    ammo.reset();assert.ok(ammo.capture().stations.every(s=>s.uses===0&&s.cooldownRemaining===0))
    ammo.reset(saved);assert.deepEqual(ammo.capture(),saved)
    const duplicate=json(saved);duplicate.stations[1].id=duplicate.stations[0].id
    const invalid=[null,{},[],{version:1,consumed:[]},{version:2,stations:[]},duplicate]
    for(const [key,value]of [['id','unknown'],['cooldownRemaining',NaN],['cooldownRemaining',-1],['cooldownRemaining',10.1],['uses',-1],['uses',.5],['uses',0]]){
      const bad=json(saved);bad.stations[0][key]=value;invalid.push(bad)
    }
    for(const bad of invalid){assert.throws(()=>ammo.restore(bad),/Invalid reusable ammo/);assert.deepEqual(ammo.capture(),saved)}
    const detached=ammo.validateCapture(saved);detached.stations[0].uses=999;assert.deepEqual(ammo.capture(),saved)
    a.at(sites[0]);a.spend();a.press();assert.equal(a.commits.length,count)
    equipment.restore(kit);ammo.restore(saved);assert.deepEqual(equipment.capture(),kit)
    equipment.restore(entry);ammo.reset();assert.deepEqual(equipment.capture(),entry)
    assert.ok(ammo.capture().stations.every(s=>s.uses===0&&s.cooldownRemaining===0))
  }finally{a.cleanup()}
})

test('M5-B repeated cooldowns and resets retain two light slots and fixed meshes/colliders; dispose releases only owned resources',()=>{
  const old=[...f.g.physics.boxes],a=fixture(),{g,ammo}=a,lights=[],resources=[]
  for(const s of sites)g.scene.getObjectByName(s.id).parent.traverse(o=>{if(o.isSpotLight&&!lights.includes(o))lights.push(o);if(o.isMesh&&!resources.includes(o))resources.push(o)})
  const boxes=[...g.physics.boxes],builds=a.builds()
  try{
    assert.equal(lights.length,2)
    for(let i=0;i<8;i++){
      for(const site of sites){a.at(site);a.spend();a.press()}
      assert.ok(lights.every(l=>l.intensity===0));assert.ok(lights.every(l=>l.visible&&l.parent))
      a.frame(10);assert.ok(lights.every(l=>l.intensity===16))
      const saved=json(ammo.capture());ammo.reset();ammo.restore(saved)
    }
    assert.equal(g.physics.boxes.length,boxes.length);for(const [i,box]of boxes.entries())assert.equal(g.physics.boxes[i],box)
    assert.equal(a.builds(),builds)
    assert.equal(ammo.snapshot().ownedGeometryCount,6);assert.equal(ammo.snapshot().lightCount,2)
    for(const resource of resources)assert.ok(resource.parent)
    ammo.dispose();ammo.dispose();assert.equal(g.physics.boxes.length,old.length)
    for(const [i,box]of old.entries())assert.equal(g.physics.boxes[i],box)
    assert.ok(lights.every(l=>!l.parent));assert.equal(ammo.snapshot().lightCount,0)
  }finally{a.cleanup()}
})
