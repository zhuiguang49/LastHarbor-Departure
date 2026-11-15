import assert from 'node:assert/strict'
import { test,after } from 'node:test'
import { nativeChapter4Fixture } from './campaign-ch4.check.mjs'
import { CH4 } from './campaign-ch4-layout.mjs'
import { installChapter4Ammo,CH4_AMMO_COOLDOWN } from './campaign-ch4-ammo.mjs'

const f=await nativeChapter4Fixture(),{T}=f
f.g.scene.add(f.layer.root)
const lightPool=Array.from({length:4},()=>{const light=new T.SpotLight(0xffffff,10);f.g.scene.add(light);return light})
after(()=>{f.dispose();for(const light of lightPool)light.dispose()})
const json=value=>JSON.parse(JSON.stringify(value)),v=p=>new T.Vector3(p.x,p.y,p.z)
function fixture(){
  let down=false,pressed=false,allowed=true,restores=0,builds=0
  const specs={rifle:{magSize:40,reserveCap:160},pistol:{magSize:12,reserveCap:48},knife:{magSize:1,reserveCap:0}}
  let kit={activeWeapon:'pistol',pickupEnabled:{rifle:false,pistol:false,knife:false},
    slots:{rifle:{owned:true,ammo:2,reserve:3},pistol:{owned:true,ammo:1,reserve:4},knife:{owned:true,ammo:1,reserve:0}}}
  const equipment={capture:()=>json(kit),snapshot:()=>({slots:Object.fromEntries(Object.entries(kit.slots).map(([id,s])=>[id,{...s,...specs[id]}]))}),
    restore(saved){restores++;kit=json(saved)}}
  const changes=[],g={...f.g,game:{state:'playing'},time:{frame:0},input:{down:()=>down,pressed:()=>pressed},
    physics:{...f.g.physics,build(){builds++;f.g.physics.build()}},hud:{setPrompt(text){this.prompt=text}},
    player:{pos:v(CH4.ammo.approach),eye:v(CH4.ammo.approach).add(new T.Vector3(0,1.68,0)),forward:v(CH4.ammo.target).sub(v(CH4.ammo.approach)).setY(0).normalize(),alive:true,enabled:true}}
  const ammo=installChapter4Ammo(g,equipment,{enabled:()=>allowed,onChange:event=>changes.push({event,state:json(ammo.capture()),kit:equipment.capture()})})
  function tick(dt=0,held=false,edge=held){down=held;pressed=edge;g.time.frame++;ammo.update(dt);return ammo.interact()}
  function press(){tick();return tick(0,true)}
  function drain(){const saved=equipment.capture();for(const id of ['rifle','pistol'])saved.slots[id].ammo=1;equipment.restore(saved)}
  return {g,ammo,equipment,specs,changes,tick,press,drain,setAllowed(value){allowed=value},restores:()=>restores,builds:()=>builds}
}

test('M4 crate atomically fills only owned rifle/P12 capacities and commits cooldown after equipment',()=>{
  for(const owned of [['rifle'],['pistol'],['rifle','pistol']]){
    const a=fixture(),before=a.equipment.capture()
    for(const id of ['rifle','pistol'])before.slots[id].owned=owned.includes(id)
    a.specs.pistol={magSize:9,reserveCap:27};a.equipment.restore(before)
    const restores=a.restores()
    assert.equal(a.ammo.tryUse(),true);assert.equal(a.restores(),restores+1)
    const actual=a.equipment.capture()
    for(const id of ['rifle','pistol'])assert.deepEqual(actual.slots[id],owned.includes(id)?
      {owned:true,ammo:a.specs[id].magSize,reserve:a.specs[id].reserveCap}:before.slots[id])
    assert.deepEqual(actual.slots.knife,before.slots.knife)
    assert.equal(actual.activeWeapon,before.activeWeapon);assert.deepEqual(actual.pickupEnabled,before.pickupEnabled)
    assert.equal(a.changes.length,1);assert.deepEqual(a.changes[0].kit,actual)
    assert.deepEqual(a.changes[0].state,{version:1,cooldownRemaining:15,uses:1})
    a.drain();assert.equal(a.ammo.tryUse(),false);assert.equal(a.changes.length,1)
  }
})

test('M4 full/no-gun attempts preserve availability, ownership and knife without starting cooldown',()=>{
  for(const owned of [[],['rifle'],['pistol'],['rifle','pistol']]){
    const a=fixture(),kit=a.equipment.capture()
    for(const id of ['rifle','pistol'])Object.assign(kit.slots[id],{owned:owned.includes(id),ammo:a.specs[id].magSize,reserve:a.specs[id].reserveCap})
    a.equipment.restore(kit);const restores=a.restores()
    assert.equal(a.ammo.tryUse(),false);assert.equal(a.press(),true)
    assert.equal(a.restores(),restores);assert.deepEqual(a.equipment.capture(),kit)
    assert.deepEqual(a.ammo.capture(),{version:1,cooldownRemaining:0,uses:0});assert.equal(a.changes.length,0)
    assert.match(a.ammo.prompt(),owned.length?/已满/:/尚未持有/)
  }
})

test('M4 fifteen-second cooldown uses eligible simulation updates once per frame and pauses with game/control/modal gates',()=>{
  const a=fixture(),{g,ammo}=a
  assert.equal(ammo.tryUse(),true);a.drain()
  a.tick(5);assert.equal(ammo.capture().cooldownRemaining,10)
  ammo.update(5);assert.equal(ammo.capture().cooldownRemaining,10,'Duplicate same-frame update advanced cooldown')
  for(const mode of ['paused','dead','disabled','modal']){
    if(mode==='paused')g.game.state='paused'
    if(mode==='dead')g.player.alive=false
    if(mode==='disabled')g.player.enabled=false
    if(mode==='modal')a.setAllowed(false)
    a.tick(100,true);assert.equal(ammo.capture().cooldownRemaining,10);assert.equal(ammo.tryUse(),false)
    g.game.state='playing';g.player.alive=g.player.enabled=true;a.setAllowed(true)
  }
  for(const invalid of [NaN,Infinity,-1]){a.tick(invalid);assert.equal(ammo.capture().cooldownRemaining,10)}
  a.tick(9.5);assert.equal(ammo.tryUse(),false);assert.match(ammo.prompt(),/1秒/)
  a.tick(.5);assert.equal(ammo.capture().cooldownRemaining,0)
  assert.equal(ammo.tryUse(),true);assert.equal(ammo.capture().uses,2);assert.equal(ammo.capture().cooldownRemaining,CH4_AMMO_COOLDOWN)
})

test('M4 ammo E requires facing, range, actual native LOS and a fresh input edge; prompts stay available on full/cooldown',()=>{
  const a=fixture(),{g,ammo}=a
  assert.equal(a.tick(),true);assert.equal(a.changes.length,0)
  g.player.forward.negate();assert.equal(a.press(),false);assert.equal(ammo.tryUse(),false);g.player.forward.negate()
  g.player.pos.z-=4;g.player.eye.z-=4;assert.equal(a.press(),false);g.player.pos.z+=4;g.player.eye.z+=4
  g.player.pos.y+=4;g.player.eye.y+=4;assert.equal(a.press(),false);g.player.pos.y-=4;g.player.eye.y-=4
  const target=v(CH4.ammo.target),middle=g.player.eye.clone().lerp(target,.5)
  const box=g.physics.addBox(middle.clone().addScalar(-.12),middle.clone().addScalar(.12));f.g.physics.build()
  try{assert.equal(g.physics.lineOfSight(g.player.eye,target),false);assert.equal(a.press(),false);assert.equal(ammo.tryUse(),false)}
  finally{g.physics.removeBox(box);f.g.physics.build()}
  assert.equal(a.press(),true);assert.equal(a.changes.length,1);assert.match(g.hud.prompt,/15秒/)
  ammo.interact();assert.equal(a.changes.length,1)
  a.drain();a.tick(15,true,true)
  assert.equal(a.changes.length,1,'Held E retriggered once the cooldown finished')
  a.press();assert.equal(a.changes.length,2)
})

test('M4 JSON reset restores only cooldown/use state and rejects replayed held input',()=>{
  const a=fixture(),{ammo}=a
  a.press();a.tick(4,true)
  const saved=json(ammo.capture());assert.equal(saved.cooldownRemaining,11)
  ammo.reset();assert.deepEqual(ammo.capture(),{version:1,cooldownRemaining:0,uses:0})
  a.drain();a.tick(0,true,true);assert.equal(a.changes.length,1)
  ammo.reset(saved);assert.deepEqual(json(ammo.capture()),saved);assert.equal(ammo.tryUse(),false)
  a.tick(11);a.press();assert.equal(ammo.capture().uses,2)
  const before=json(ammo.capture())
  for(const bad of [{version:2,cooldownRemaining:0,uses:0},{version:1,cooldownRemaining:-1,uses:0},{version:1,cooldownRemaining:16,uses:0},{version:1,cooldownRemaining:0,uses:.5}]){
    assert.throws(()=>ammo.reset(bad),/Invalid CH4 ammunition checkpoint/);assert.deepEqual(json(ammo.capture()),before)
  }
})

test('M4 refill, cooldown and reset retain every existing light/object/collider without adding render resources',()=>{
  const children=[...f.g.scene.children],boxes=[...f.g.physics.boxes],lights=[]
  f.g.scene.traverse(o=>{if(o.isLight)lights.push({object:o,intensity:o.intensity,color:o.color.getHex()})})
  const a=fixture()
  a.press();a.drain();a.tick(15);a.press();a.ammo.reset(json(a.ammo.capture()));a.ammo.reset()
  assert.equal(a.builds(),0);assert.equal(f.g.scene.children.length,children.length);assert.equal(f.g.physics.boxes.length,boxes.length)
  children.forEach((object,i)=>assert.equal(f.g.scene.children[i],object));boxes.forEach((box,i)=>assert.equal(f.g.physics.boxes[i],box))
  const after=[];f.g.scene.traverse(o=>{if(o.isLight)after.push(o)})
  assert.equal(after.length,lights.length);lights.forEach((light,i)=>assert.equal(after[i],light.object))
  for(const light of lights){assert.equal(light.object.intensity,light.intensity);assert.equal(light.object.color.getHex(),light.color)}
})
