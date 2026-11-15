import assert from 'node:assert/strict'
import { test,after } from 'node:test'
import { nativeChapter3Fixture } from './campaign-ch3.check.mjs'
import { capsulePath,navPath } from './campaign-ch2.check.mjs'
import { CH3,CH3_ROUTES } from './campaign-ch3-layout.mjs'
import { CH3_CLEARANCE_DEPLOYMENTS } from './campaign-ch3-deployment.mjs'
import { installChapter3Ammo,CH3_AMMO_SITES as sites,CH3_EXIT_AMMO_SITE } from './campaign-ch3-ammo.mjs'

// Real immutable-source Three/physics/nav/factories and current A0 user meshes.
// Material rasters, input, equipment persistence and soldiers are test doubles.
const f=await nativeChapter3Fixture(),{T}=f
after(()=>f.dispose())
const json=value=>JSON.parse(JSON.stringify(value)),v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),point=p=>v(p.x,p.y,p.z)
function fixture(includeExit=false){
  let down=false,pressed=false,narrativeActive=false,builds=0,restores=0
  let members=CH3_CLEARANCE_DEPLOYMENTS.map(definition=>({id:definition.id,definition,target:{actor:{alive:true}}}))
  const specs={rifle:{magSize:40,reserveCap:160},pistol:{magSize:12,reserveCap:48},knife:{magSize:0,reserveCap:0}}
  let kit={activeWeapon:'pistol',pickupEnabled:{rifle:false,pistol:false,knife:false},
    slots:{rifle:{owned:true,ammo:2,reserve:3},pistol:{owned:true,ammo:1,reserve:4},knife:{owned:true,ammo:0,reserve:0}}}
  const equipment={capture:()=>json(kit),snapshot:()=>({slots:Object.fromEntries(Object.entries(kit.slots).map(([id,s])=>[id,{...s,...specs[id]}]))}),
    restore(saved){restores++;kit=json(saved)}}
  const commits=[],g={...f.g,physics:{...f.g.physics,build(){builds++;f.g.physics.build()}},
    game:{state:'playing'},time:{frame:1},input:{down:()=>down,pressed:()=>pressed},hud:{setPrompt(text){this.prompt=text}},
    player:{pos:v(),eye:v(),forward:v(),alive:true,enabled:true}}
  const ammo=installChapter3Ammo(g,{equipment,narrative:{snapshot:()=>({active:narrativeActive})},getMembers:()=>members,includeExit,
    onCheckpoint:event=>commits.push({event,state:json(ammo.capture()),equipment:equipment.capture()})})
  function place(position,target){g.player.pos.copy(position);g.player.eye.copy(position).y+=1.68;g.player.forward.copy(target).sub(position).setY(0).normalize()}
  function at(site){const s=ammo.snapshot().sites.find(s=>s.id===site.id);place(point(site.approach),v(...s.target))}
  function frame(held=false,edge=held){down=held;pressed=edge;g.time.frame++;ammo.update();return ammo.interact()}
  function press(){frame(false);return frame(true)}
  function clear(group){for(const m of members)if(m?.definition?.group===group)m.target.actor.alive=false;ammo.update()}
  return {g,ammo,equipment,specs,commits,place,at,frame,press,clear,get members(){return members},setMembers(value){members=value},setNarrative(value){narrativeActive=value},
    builds:()=>builds,restores:()=>restores,cleanup:()=>ammo.dispose()}
}

test('formal exit supply is right of the west-facing connector, solid/reachable and one-use across JSON retries',()=>{
  const baseline=f.g.physics.boxes.slice(),a=fixture(true),{g,ammo,equipment}=a,site=CH3_EXIT_AMMO_SITE
  try{
    const station=ammo.snapshot().sites.find(s=>s.id===site.id)
    assert.equal(ammo.snapshot().sites.length,5);assert.equal(station.open,true)
    assert.ok(site.position.x>-60&&site.position.z<-110&&site.position.z>-116)
    const facing=v(-1,0,0),right=facing.clone().cross(v(0,1,0))
    assert.ok(point(site.position).sub(v(-60,0,-110)).dot(right)>0,'Crate must be on the player’s right when facing the connector')
    a.at(site);assert.equal(g.physics.nav.isWalkable(site.approach.x,site.approach.z),true)
    assert.equal(g.physics.lineOfSight(g.player.eye,v(...station.target)),true)
    const holder=g.scene.getObjectByName(site.id);holder.updateMatrixWorld(true)
    for(const prop of holder.children.filter(o=>o.userData.prop)){
      const bounds=new T.Box3().setFromObject(prop)
      for(const old of baseline){const size=bounds.clone().intersect(old).getSize(v());assert.ok(size.x*size.y*size.z<1e-6,`exit supply overlaps ${old.tag}`)}
    }
    assert.equal(g.physics.nav.isWalkable(site.position.x,site.position.z),false)
    const origin=point(site.approach).setY(.68),dir=point(site.position).setY(.68).sub(origin).normalize()
    assert.equal(g.physics.raycast(origin,dir,3)?.box?.tag,site.id+':crate_wood')
    assert.ok(new T.Raycaster(origin,dir,0,3).intersectObject(holder,true).length)
    for(const height of [1.8,1.15]){
      const pos=point(site.approach),result=g.physics.moveCapsule(pos,dir.clone().multiplyScalar(2),1,.32,height)
      assert.equal(result.hitWall,true)
    }
    for(const [from,to]of [[site.route,site.approach],[site.approach,site.route]])navPath(g,from,to,'exit-ammo')
    capsulePath(g,[site.route,site.approach,site.route,{x:-64,y:0,z:-110}],'exit-ammo/connector')
    a.press();assert.equal(equipment.capture().slots.rifle.ammo,40);assert.equal(equipment.capture().slots.rifle.reserve,160)
    assert.equal(equipment.capture().slots.pistol.ammo,12);assert.equal(equipment.capture().slots.pistol.reserve,48)
    const saved=json(ammo.capture());assert.ok(saved.consumed.includes(site.id))
    ammo.reset();ammo.restore(saved)
    const kit=equipment.capture();kit.slots.rifle.ammo=kit.slots.rifle.reserve=1;equipment.restore(kit)
    a.press();assert.equal(equipment.capture().slots.rifle.ammo,1);assert.equal(equipment.capture().slots.rifle.reserve,1)
    assert.equal(a.commits.length,1)
  }finally{a.cleanup()}
})

test('only the complete fixed three identities unlock each independent central station; west needs no kills',()=>{
  const a=fixture(),{ammo}=a
  try{
    assert.deepEqual(ammo.snapshot().sites.map(s=>s.open),[false,false,false,true])
    const original=a.members
    for(const group of ['g1','g2','g3']){
      const expected=original.filter(m=>m.definition.group===group)
      for(const m of expected)m.target.actor.alive=false
      for(const missing of expected){a.setMembers(original.filter(m=>m!==missing));ammo.update();assert.equal(ammo.snapshot().sites.find(s=>s.group===group).open,false)}
      a.setMembers([...original,expected[0]]);ammo.update();assert.equal(ammo.snapshot().sites.find(s=>s.group===group).open,false)
      const wrong=expected[0];a.setMembers(original.map(m=>m===wrong?{...m,definition:{group:'wrong'}}:m));ammo.update();assert.equal(ammo.snapshot().sites.find(s=>s.group===group).open,false)
      for(const bad of [null,{},[]]){a.setMembers(bad);ammo.update();assert.equal(ammo.snapshot().sites.find(s=>s.group===group).open,false)}
      a.setMembers(original);ammo.update();assert.equal(ammo.snapshot().sites.find(s=>s.group===group).open,true)
      for(const m of expected)m.target.actor.alive=true
      expected[0].target.actor.alive=false;expected[1].target.actor.alive=false;ammo.update()
      assert.equal(ammo.snapshot().sites.find(s=>s.group===group).open,false)
      expected[2].target.actor.alive=false;ammo.update()
      assert.equal(ammo.snapshot().sites.find(s=>s.group===group).open,true)
      const future=['g1','g2','g3'].slice(['g1','g2','g3'].indexOf(group)+1)
      for(const id of future)assert.equal(ammo.snapshot().sites.find(s=>s.group===id).open,false)
    }
    assert.ok(original.filter(m=>m.definition.route==='west').every(m=>m.target.actor.alive))
  }finally{a.cleanup()}
})

test('all four physical stations atomically refill both owned magazines and reserves once; callbacks see committed state',()=>{
  const a=fixture(),{ammo,equipment}=a
  try{
    for(const site of sites){
      if(site.group)a.clear(site.group)
      const before=equipment.capture();before.slots.rifle.ammo=0;before.slots.rifle.reserve=0;before.slots.pistol.ammo=0;before.slots.pistol.reserve=0;equipment.restore(before)
      const restores=a.restores();a.at(site);assert.equal(a.press(),true)
      const saved=equipment.capture()
      assert.deepEqual(saved.slots,{rifle:{owned:true,ammo:40,reserve:160},pistol:{owned:true,ammo:12,reserve:48},knife:{owned:true,ammo:0,reserve:0}})
      assert.equal(saved.activeWeapon,before.activeWeapon);assert.deepEqual(saved.pickupEnabled,before.pickupEnabled);assert.equal(a.restores(),restores+1)
      assert.equal(a.commits.at(-1).event.id,site.id);assert.ok(a.commits.at(-1).state.consumed.includes(site.id));assert.deepEqual(a.commits.at(-1).equipment,saved)
      const spent=equipment.capture();spent.slots.rifle.ammo=1;equipment.restore(spent)
      assert.equal(a.press(),true);assert.equal(equipment.capture().slots.rifle.ammo,1)
    }
    assert.equal(a.commits.length,4);assert.equal(ammo.capture().consumed.length,4);assert.equal(ammo.snapshot().lightCount,0)
  }finally{a.cleanup()}
})

test('refill, JSON restore and reset keep the renderer light slots stable while spent lamps go dark',()=>{
  const a=fixture(),root=a.g.scene.getObjectByName('campaign-ch3-ammo')
  const visibleLights=()=>{const lights=[];root.traverseVisible(o=>{if(o.isSpotLight)lights.push(o)});return lights}
  try{
    const slots=visibleLights();assert.equal(slots.length,4)
    for(const site of sites){
      if(site.group)a.clear(site.group)
      const kit=a.equipment.capture();kit.slots.rifle.ammo=1;a.equipment.restore(kit)
      a.at(site);a.press()
      assert.deepEqual(visibleLights().map(l=>l.uuid),slots.map(l=>l.uuid),'consumption must not change NUM_SPOT_LIGHTS or rebuild PBR programs')
      assert.equal(slots.filter(l=>l.intensity>0).length,4-a.ammo.capture().consumed.length)
    }
    const saved=json(a.ammo.capture());a.ammo.reset()
    assert.deepEqual(visibleLights().map(l=>l.uuid),slots.map(l=>l.uuid));assert.ok(slots.every(l=>l.intensity===16))
    a.ammo.restore(saved)
    assert.deepEqual(visibleLights().map(l=>l.uuid),slots.map(l=>l.uuid));assert.ok(slots.every(l=>l.intensity===0))
    assert.equal(a.ammo.snapshot().lightCount,0)
  }finally{a.cleanup()}
})

test('ownership, capacity specs and full/no-gun cases never consume a usable pickup or change a knife',()=>{
  const a=fixture(),{ammo,equipment}=a,west=sites[3]
  try{
    a.at(west)
    for(const owned of [[],['rifle'],['pistol'],['rifle','pistol']]){
      const saved=equipment.capture();saved.activeWeapon=null
      for(const id of ['rifle','pistol'])Object.assign(saved.slots[id],{owned:owned.includes(id),ammo:a.specs[id].magSize,reserve:a.specs[id].reserveCap})
      equipment.restore(saved);const count=a.restores();a.press()
      assert.deepEqual(equipment.capture(),saved);assert.deepEqual(ammo.capture().consumed,[]);assert.equal(a.restores(),count)
    }
    // A single missing reserve round still makes a full magazine eligible.
    a.specs.pistol.magSize=9;a.specs.pistol.reserveCap=27
    let saved=equipment.capture();saved.slots.rifle.owned=false;saved.slots.pistol.ammo=9;saved.slots.pistol.reserve=26;equipment.restore(saved)
    const before=equipment.capture();a.press();saved=equipment.capture()
    assert.deepEqual(saved.slots.pistol,{owned:true,ammo:9,reserve:27})
    assert.deepEqual(saved.slots.rifle,before.slots.rifle);assert.deepEqual(saved.slots.knife,before.slots.knife)
    assert.deepEqual(ammo.capture().consumed,[west.id])
    ammo.reset();saved.slots.rifle.owned=true;saved.slots.rifle.ammo=39;saved.slots.rifle.reserve=160;saved.slots.pistol.owned=false
    equipment.restore(saved);a.press();assert.equal(equipment.capture().slots.rifle.ammo,40)
    assert.equal(equipment.capture().slots.pistol.owned,false);assert.equal(equipment.capture().slots.pistol.reserve,27)
  }finally{a.cleanup()}
})

test('proximity, facing, real occlusion, pause, narrative, death and disabled control gate E; held/duplicate frames do not replay',()=>{
  const a=fixture(),{ammo,g,equipment}=a,site=sites[3]
  try{
    a.at(site);assert.equal(a.frame(false),true);assert.equal(a.commits.length,0)
    a.at(sites[0]);assert.equal(a.press(),true);assert.equal(a.commits.length,0);assert.match(g.hud.prompt,/封锁/)
    a.at(site);g.player.forward.negate();assert.equal(a.press(),false)
    const target=v(...ammo.snapshot().sites[3].target)
    a.place(target.clone().add(v(0,-target.y,3)),target);assert.equal(a.press(),false)
    a.place(point(site.approach).add(v(0,4,0)),target);assert.equal(a.press(),false)
    a.at(site)
    const blocker=g.physics.addBox([-40,0,-145.8],[-38.5,2.2,-145.6],{tag:'test-ammo-occluder'});g.physics.build()
    try{assert.equal(g.physics.lineOfSight(g.player.eye,target),false);assert.equal(a.press(),false)}finally{g.physics.removeBox(blocker);g.physics.build()}
    for(const mode of ['paused','intro','narrative','dead','disabled']){
      if(['paused','intro'].includes(mode))g.game.state=mode
      if(mode==='narrative')a.setNarrative(true)
      if(mode==='dead')g.player.alive=false
      if(mode==='disabled')g.player.enabled=false
      assert.equal(a.press(),false);assert.equal(a.commits.length,0)
      g.game.state='playing';g.player.alive=g.player.enabled=true;a.setNarrative(false)
      assert.equal(a.frame(true),true);assert.equal(a.commits.length,0)
    }
    a.press();assert.equal(a.commits.length,1)
    const saved=equipment.capture();saved.slots.rifle.ammo=1;equipment.restore(saved)
    ammo.reset();assert.equal(ammo.interact(),true);assert.equal(a.commits.length,1)
    for(let i=0;i<4;i++){assert.equal(a.frame(true),true);assert.equal(a.commits.length,1)}
    a.press();assert.equal(a.commits.length,2)
    assert.equal(ammo.interact(),true);assert.equal(a.commits.length,2)
    a.place(v(-56,0,-190),target);assert.equal(a.frame(false),false)
  }finally{a.cleanup()}
})

test('JSON checkpoint restore cannot farm consumed crates, derives availability from live members and rejects invalid states atomically',()=>{
  const a=fixture(),{ammo,equipment}=a
  try{
    a.clear('g2');a.at(sites[1]);a.press();a.at(sites[3]);const low=equipment.capture();low.slots.pistol.reserve=0;equipment.restore(low);a.press()
    const saved=json({ammo:ammo.capture(),equipment:equipment.capture()}),count=a.commits.length,boxes=a.g.physics.boxes.length,builds=a.builds()
    ammo.reset();assert.deepEqual(ammo.capture().consumed,[])
    for(let i=0;i<3;i++){
      equipment.restore(saved.equipment);ammo.restore(json(saved.ammo));assert.deepEqual(ammo.capture(),saved.ammo)
      for(const site of [sites[1],sites[3]]){a.at(site);const state=equipment.capture();state.slots.rifle.ammo=0;equipment.restore(state);a.press();assert.equal(equipment.capture().slots.rifle.ammo,0)}
      assert.equal(a.commits.length,count);assert.equal(a.g.physics.boxes.length,boxes);assert.equal(a.builds(),builds)
    }
    for(const bad of [null,{},[],{version:2,consumed:[]},{version:1,consumed:'x'},{version:1,consumed:[sites[0].id,sites[0].id]},{version:1,consumed:['unknown']}]){
      assert.throws(()=>ammo.restore(bad),/Invalid CH3 ammo/);assert.deepEqual(ammo.capture(),saved.ammo)
    }
    const copy=ammo.validateCapture(json(saved.ammo));copy.consumed.length=0;assert.deepEqual(ammo.capture(),saved.ammo)
    const g2=a.members.filter(m=>m.definition.group==='g2');g2[0].target.actor.alive=true;ammo.restore(saved.ammo)
    assert.equal(ammo.snapshot().sites[1].open,false);assert.equal(ammo.snapshot().sites[1].consumed,true)
  }finally{a.cleanup()}
})

test('actual A0 placements are outside decorative cargo, capsule/nav reachable beside native cover, with front LOS and solid crates',t=>{
  const baseline=f.g.physics.boxes.slice(),a=fixture(),{g,ammo}=a
  try{
    f.layer.root.updateMatrixWorld(true)
    const root=g.scene.getObjectByName('campaign-ch3-ammo');root.updateMatrixWorld(true)
    let queries=0,meshRays=0
    for(const site of sites){
      a.at(site)
      const station=ammo.snapshot().sites.find(s=>s.id===site.id),target=v(...station.target),feet=g.player.pos.clone()
      assert.equal(g.physics.nav.isWalkable(feet.x,feet.z),true)
      for(const height of [1.8,1.15]){
        const pos=feet.clone(),result=g.physics.moveCapsule(pos,v(),0,.32,height)
        assert.equal(result.hitWall,false);assert.equal(result.hitCeil,false);assert.equal(result.onGround,true);assert.ok(pos.distanceTo(feet)<1e-8)
      }
      for(const [from,to]of [[site.route,site.approach],[site.approach,site.route]]){navPath(g,from,to,site.id);queries++}
      assert.equal(g.physics.lineOfSight(g.player.eye,target),true)
      assert.equal(g.physics.lineOfSight(feet.clone().setY(1.05),target),true)
      assert.equal(ammo.interact(),true,'Native front interaction must find the real crate')
      const holder=g.scene.getObjectByName(site.id),native=holder.children.find(o=>o.userData.prop==='crate_wood')
      assert.ok(native,'No fallback crate');assert.equal(native.children.length,7)
      const box=g.physics.boxes.find(b=>b.tag===site.id+':crate_wood'),bounds=new T.Box3().setFromObject(native)
      assert.ok(bounds.min.distanceTo(box.min)<.006);assert.ok(bounds.max.distanceTo(box.max)<.006)
      assert.equal(g.physics.nav.isWalkable(site.position.x,site.position.z),false)
      for(const existing of baseline){
        const intersection=new T.Box3().copy(bounds).intersect(existing),size=intersection.getSize(v())
        assert.ok(size.x*size.y*size.z<1e-6,`${site.id}: buried in ${existing.tag}`)
      }
      const lamp=holder.children.find(o=>o.userData.prop==='floodlight_stand'),lampBounds=new T.Box3().setFromObject(lamp)
      for(const existing of baseline){
        const size=lampBounds.clone().intersect(existing).getSize(v())
        assert.ok(size.x*size.y*size.z<1e-6,`${site.id}: work light buried in ${existing.tag}`)
      }
      const front=feet.clone().setY(.68),direction=point(site.position).setY(.68).sub(front).normalize()
      const hit=g.physics.raycast(front,direction,3)
      assert.equal(hit?.box?.tag,site.id+':crate_wood')
      assert.ok(new T.Raycaster(front,direction,0,3).intersectObject(holder,true).length);meshRays++
      const collision=feet.clone(),travel=point(site.position).sub(collision).setY(0)
      assert.equal(g.physics.moveCapsule(collision,travel.clone().normalize().multiplyScalar(2),travel.length()/2,.32,1.8).hitWall,true)
      const covered=point(site.cover).setY(1.1),coverFrom=feet.clone().setY(1.1),delta=covered.clone().sub(coverFrom)
      assert.ok(delta.length()<5)
      assert.ok(g.physics.raycast(coverFrom,delta.clone().normalize(),delta.length()),`${site.id}: missing nearby native cover`)
      assert.ok(new T.Raycaster(coverFrom,delta.clone().normalize(),0,delta.length()).intersectObject(f.layer.root,true).length,`${site.id}: cover has no mesh`)
      // Behind the actual crate, the crate itself prevents remote E access.
      const back=holder.localToWorld(v(0,0,-1.25));a.place(back,target);assert.equal(a.press(),false)
    }
    // New props must preserve accepted routes and the real room mouth. Local
    // segments only: do not claim a whole-level native 9000-budget path passes.
    for(const [id,route]of Object.entries({main:CH3_ROUTES.main,west:CH3_ROUTES.west}))capsulePath(g,route,`ammo/${id}`)
    capsulePath(g,CH3.safeHouse.entrance,'ammo/safe-house')
    for(const site of sites){
      const nearest=site.group==='g3'||!site.group?{x:-33.5,y:0,z:-146.1}:site.group==='g1'?CH3_ROUTES.main[3]:{x:-20,y:0,z:-143}
      for(const [from,to]of [[nearest,site.approach],[site.approach,nearest]]){navPath(g,from,to,site.id+'/route');queries++}
    }
    let meshes=0,triangles=0
    root.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3}})
    t.diagnostic(JSON.stringify({stations:sites.length,queries,meshRays,colliders:ammo.snapshot().colliderCount,ownedGeometries:ammo.snapshot().ownedGeometryCount,lights:ammo.snapshot().lightCount,meshes,triangles}))
  }finally{a.cleanup()}
})

test('stable updates/reset reuse collision handles; dispose releases only owned resources and failed install rolls back',t=>{
  const before=f.g.physics.boxes.slice(),a=fixture(),{g,ammo}=a,root=g.scene.getObjectByName('campaign-ch3-ammo')
  let ownedDisposed=0,borrowedDisposed=0,lightDisposed=0
  const owned=new Set(),borrowed=new Set()
  root.traverse(o=>{
    if(o.isSpotLight){const release=o.dispose.bind(o);o.dispose=()=>{lightDisposed++;release()}}
    if(!o.isMesh)return
    if(o.parent.userData.prop)borrowed.add(o.geometry);else owned.add(o.geometry)
    borrowed.add(o.material)
  })
  for(const resource of owned)resource.addEventListener('dispose',()=>ownedDisposed++)
  for(const resource of borrowed)resource.addEventListener('dispose',()=>borrowedDisposed++)
  const count=g.physics.boxes.length,builds=a.builds()
  for(let i=0;i<30;i++){a.frame(false);ammo.reset()}
  assert.equal(g.physics.boxes.length,count);assert.equal(a.builds(),builds)
  assert.equal(count-before.length,8);assert.equal(owned.size,12)
  ammo.dispose();ammo.dispose()
  assert.deepEqual(g.physics.boxes,before);assert.equal(root.parent,null);assert.equal(ownedDisposed,12);assert.equal(borrowedDisposed,0);assert.equal(lightDisposed,4)
  assert.equal(ammo.snapshot().colliderCount,0);assert.throws(()=>ammo.restore({version:1,consumed:[]}),/disposed/)
  const build=f.g.props.build
  try{
    f.g.props.build=(name,options)=>name==='floodlight_stand'?new T.Group():build(name,options)
    assert.throws(()=>fixture(),/requires native floodlight_stand/)
    assert.deepEqual(f.g.physics.boxes,before);assert.equal(f.g.scene.getObjectByName('campaign-ch3-ammo'),undefined)
  }finally{f.g.props.build=build}
  t.diagnostic(JSON.stringify({collidersAdded:8,ownedGeometryReleased:ownedDisposed,borrowedDisposed,lightsReleased:lightDisposed,stableBuilds:builds}))
})
