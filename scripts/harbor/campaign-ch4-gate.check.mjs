import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeChapter4Fixture } from './campaign-ch4.check.mjs'
import { capsulePath, navPath } from './campaign-ch2.check.mjs'
import { CH4 } from './campaign-ch4-layout.mjs'
import { CH4_GATE_MOTION } from './campaign-ch4-gate.mjs'

const tag='campaign-ch4-asset:security-gate',p=(x,z,y=0)=>({x,y,z})
const json=value=>JSON.parse(JSON.stringify(value))
function ray(f,height,x=-70){
  const {g,T,layer}=f,a=new T.Vector3(x,height,-9),b=new T.Vector3(x,height,-5),d=b.clone().sub(a)
  return {physical:g.physics.raycast(a,d.clone().normalize(),d.length()),
    visible:new T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(layer.root,true)}
}

test('M4 gate stays closed until host start; moving source geometry and original handles share the same vertical offset',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f,gate=layer.gate,object=layer.root.getObjectByName('campaign-ch4-gate')
  try{
    const original=new T.Box3().setFromObject(object),handles=g.physics.boxes.filter(b=>b.tag===tag),initial=handles.map(b=>({min:b.min.clone(),max:b.max.clone()}))
    const infill=g.physics.boxes.filter(b=>b.tag==='campaign-ch4-gate-infill').map(b=>({box:b,min:b.min.clone(),max:b.max.clone()}))
    gate.update(100)
    assert.deepEqual(gate.capture(),{started:false,progress:0});assert.equal(gate.snapshot().phase,'closed')
    assert.equal(gate.isPassableAt(p(-70,-7)),false);assert.equal(g.physics.nav.isWalkable(-70,-7),false)
    assert.equal(ray(f,1.05).physical?.box?.tag,tag);assert.ok(ray(f,1.05).visible.length)
    assert.equal(gate.start(),true);assert.equal(gate.start(),false)
    gate.update(1)
    const state=gate.snapshot(),moved=new T.Box3().setFromObject(object)
    assert.equal(state.phase,'opening');assert.equal(state.lift,.75)
    assert.ok(moved.min.distanceTo(original.min.clone().add(new T.Vector3(0,.75,0)))<1e-7)
    assert.ok(moved.max.distanceTo(original.max.clone().add(new T.Vector3(0,.75,0)))<1e-7)
    for(const [i,box]of handles.entries()){
      assert.ok(g.physics.boxes.includes(box),'Replaced an owned original handle')
      assert.ok(box.min.distanceTo(initial[i].min.clone().add(new T.Vector3(0,.75,0)))<1e-7)
      assert.ok(box.max.distanceTo(initial[i].max.clone().add(new T.Vector3(0,.75,0)))<1e-7)
    }
    for(const {box,min,max}of infill){assert.deepEqual(box.min,min);assert.deepEqual(box.max,max)}
    const placement=layer.snapshot().assetPlacements.find(a=>a.id==='security-gate')
    assert.equal(placement.position.y,.75)
    assert.deepEqual(json(placement.colliders),json(handles.map(b=>({min:b.min.toArray(),max:b.max.toArray()}))))
    assert.equal(gate.isPassableAt(p(-75,-7),{height:1.15}),false,'Side infill is outside the moving aperture')
    t.diagnostic(JSON.stringify({motion:CH4_GATE_MOTION,aperture:state.aperture,ownedMovingHandles:handles.length,fixedInfill:infill.length}))
  }finally{f.dispose()}
})

test('M4 rising gate admits crouching then standing before open, clears native navigation and keeps the raised mesh solid',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f,gate=layer.gate
  try{
    gate.start();gate.update(1.6)
    assert.equal(gate.snapshot().phase,'opening')
    assert.equal(gate.isPassableAt(p(-70,-7),{height:1.15}),true)
    assert.equal(gate.isPassableAt(p(-70,-7),{height:1.8}),false)
    assert.equal(ray(f,1.05).physical,null);assert.equal(ray(f,1.05).visible.length,0)
    for(const route of [[p(-70,-9),p(-70,-5)],[p(-70,-5),p(-70,-9)]])capsulePath(g,route,'rising-crouch',1.15)
    const standing=new T.Vector3(-70,0,-9)
    assert.equal(g.physics.moveCapsule(standing,new T.Vector3(0,0,3),4/3).hitWall,true)
    gate.update(.9)
    assert.equal(gate.snapshot().phase,'opening');assert.ok(gate.snapshot().progress<1)
    assert.equal(gate.isPassableAt(p(-70,-7)),true)
    assert.equal(g.physics.nav.isWalkable(-70,-7),true)
    navPath(g,p(-70,-9),p(-70,-5),'rising-native-path')
    capsulePath(g,[p(-70,-9),p(-70,-5)],'rising-standing')
    const early=gate.snapshot()
    gate.update(10)
    assert.equal(gate.snapshot().phase,'open');assert.equal(gate.snapshot().lift,3)
    const path=[p(-70,-9),...CH4.sevenApproach.route,p(-38,5)]
    capsulePath(g,path,'open-gate-to-original-seven-seam')
    capsulePath(g,[...path].reverse(),'original-seven-seam-return')
    navPath(g,CH4.console.approach,p(-38,5),'console-to-original-seven-seam')
    navPath(g,p(-38,5),CH4.console.approach,'original-seven-seam-to-console')
    assert.equal(ray(f,3.8).physical?.box?.tag,tag,'Raised gate disappeared from bullet/LOS geometry')
    assert.ok(ray(f,3.8).visible.length)
    assert.equal(ray(f,1.3,-75).physical?.box?.tag,'campaign-ch4-gate-infill')
    t.diagnostic(JSON.stringify({earlyStanding:early,opened:gate.snapshot(),throughPath:path}))
  }finally{f.dispose()}
})

test('M4 native player can cross while the gate rises, release crouch below it and stand after clearance',async t=>{
  const f=await nativeChapter4Fixture(),{g,T,layer}=f,gate=layer.gate
  try{
    g.camera=new T.PerspectiveCamera();g.render=null
    g.events={emit(){},on(){},off(){}};g.enemies={raycast:()=>null};g.game={state:'playing',run:{time:0}};g.time={frame:0}
    g.input={down:()=>false,pressed:()=>false,look:{dx:0,dy:0},move:{x:0,y:1},sprint:false,crouch:true,fire:false,ads:false}
    g.player=f.createPlayer(g);g.player.reset({pos:new T.Vector3(-70,0,-7.8),yaw:Math.PI})
    gate.start();gate.update(1.6)
    let crossing=null,releasedBelow=false,previous=g.player.pos.clone()
    for(let i=0;i<180&&g.player.pos.z<-5.3;i++){
      if(g.player.pos.z>CH4.gate.position.z-.1){g.input.crouch=false;releasedBelow ||= g.player.crouching}
      g.time.frame++;g.game.run.time+=1/60;g.player.update(1/60);gate.update(1/60)
      const now=g.player.pos
      if(!crossing&&previous.z<=-7&&now.z>-7){
        const ratio=(-7-previous.z)/(now.z-previous.z),point={x:previous.x+(now.x-previous.x)*ratio,y:previous.y+(now.y-previous.y)*ratio,z:-7}
        assert.equal(gate.isPassableAt(point,{height:1.15}),true)
        crossing={position:point,gate:gate.snapshot(),crouching:g.player.crouching}
      }
      previous.copy(now)
    }
    assert.ok(crossing,'Native movement never crossed the real gate plane')
    assert.equal(crossing.gate.phase,'opening','Host must accept the real crossing before final open')
    assert.ok(releasedBelow);assert.equal(g.player.crouching,false);assert.ok(g.player.pos.z>-5.4)
    gate.update(10)
    assert.equal(crossing.gate.phase,'opening','Recorded crossing must not require a second passage')
    t.diagnostic(JSON.stringify({crossing,finalPlayer:g.player.pos.toArray(),standing:!g.player.crouching}))
  }finally{f.dispose()}
})

test('M4 gate JSON capture/reset restores real closure, batches unchanged nav occupancy and never owns source resources',async t=>{
  const f=await nativeChapter4Fixture(),{g,layer,assets}=f,gate=layer.gate
  try{
    const build=g.physics.build.bind(g.physics);let builds=0,resourcesReleased=0
    g.physics.build=()=>{builds++;build()}
    for(const value of Object.values(assets.models))for(const resource of [value.geometry,value.material])resource.addEventListener('dispose',()=>resourcesReleased++)
    gate.start();gate.update(1.6)
    const saved=json(gate.capture())
    gate.update(10);gate.reset(saved)
    assert.deepEqual(json(gate.capture()),saved);assert.equal(gate.isPassableAt(p(-70,-7),{height:1.15}),true)
    gate.reset()
    assert.deepEqual(gate.capture(),{started:false,progress:0});assert.equal(ray(f,1.05).physical?.box?.tag,tag)
    assert.equal(g.physics.nav.isWalkable(-70,-7),false)
    assert.equal(layer.root.getObjectByName('campaign-ch4-gate').position.y,CH4.gate.position.y)
    builds=0;gate.start()
    for(let frame=0;frame<240;frame++)gate.update(1/60)
    assert.ok(builds<30,`Rebuilt unchanged whole-world navigation ${builds} times`)
    const count=g.physics.boxes.length
    gate.dispose();gate.update(1);gate.reset()
    assert.equal(g.physics.boxes.length,count);assert.equal(resourcesReleased,0)
    layer.dispose();assert.equal(resourcesReleased,0)
    t.diagnostic(JSON.stringify({animatedFrames:240,nativeNavRebuilds:builds,sourceResourcesDisposedByGate:resourcesReleased}))
  }finally{f.dispose()}
})
