import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {parse} from '@babel/parser'
import {test} from 'node:test'
import {capsulePath,navPath,isMain} from './campaign-ch2.check.mjs'
import {createChapter5Warehouse} from './campaign-ch5-warehouse.mjs'

const json=value=>JSON.parse(JSON.stringify(value)),p=(x,z,y=0)=>({x,y,z})
const bytes=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'),'9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html=bytes.toString(),source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const body=parse(source).program.body[0].expression.callee.body.body
const boundary=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='gM'))
const nodes=body.filter(n=>n.end<=boundary.start),prefix=source.slice(nodes[0].start,nodes.at(-1).end)
const native=vm.runInNewContext(`(()=>{${prefix};return {T:lt,props:Yg,physics:d3,context:ob,warehouse:ab,yard:hR,entry:fR,quay:cb,player:x_,rng:il}})()`,
  {console,performance,AbortController},{timeout:15000})

// Exact native warehouse/yard/entry/quay factories and physics. Texture-less
// native materials are test doubles; these assertions do not accept visuals.
export function nativeChapter5Fixture(){
  const T=native.T,materials=new Map(),texture=new T.Texture()
  const get=(name,options={})=>{
    const key=name+JSON.stringify(options)
    if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({name,map:texture,
      vertexColors:!!options.vertexColors,transparent:name.startsWith('label_')||name.startsWith('decal_')}))
    return materials.get(key)
  }
  const g={THREE:T,scene:new T.Scene(),rng:native.rng(4207),mats:{get,
    label:(text,options)=>({material:get(`label_${text}`,options),aspect:Math.max(1,text.length*.55)}),
    decal:name=>({material:get(`decal_${name}`),aspect:1}),
    emissive:(color,intensity)=>{const m=get(`emissive_${color}_${intensity}`);m.emissive.set(color);m.emissiveIntensity=intensity;return m},
  }}
  g.physics=native.physics(g);g.props=native.props(g)
  const context=native.context(g),place=context.place
  context.place=(name,x,z,yaw,options,y,extra)=>place(name,x,z,
    name==='jersey_barrier'&&x===-34.7?0:yaw,name==='gate_arm'?{...options,open:1}:options,y,extra)
  native.yard(context);native.entry(context)
  const warehouse=native.warehouse(context);native.quay(context)
  const power=context.place('relay_node',1.5,7.5,.35,{seed:1},0)
  const control=context.place('relay_node',-2,-19.5,.9*Math.PI/2,{seed:2},.03)
  const fuel=context.place('relay_node',23,0,-.2,{seed:3},0)
  g.scene.add(context.staticRoot,context.dynRoot);g.scene.updateMatrixWorld(true);g.physics.build()
  const originals=g.physics.boxes.map(box=>({box,min:box.min.clone(),max:box.max.clone()}))
  const shutters=createChapter5Warehouse(g)
  return {g,T,warehouse,context,shutters,originals,devices:{power,control,fuel},createPlayer:native.player}
}

const approaches=[
  {id:'south',from:p(-3.5,-9.5),to:p(-3.5,-12.5),centre:p(-3.5,-11.16)},
  {id:'east',from:p(13.5,-19.5),to:p(10.5,-19.5),centre:p(11.96,-19.5)},
]
function rays(f,door,height){
  const a=new f.T.Vector3(door.from.x,height,door.from.z),b=new f.T.Vector3(door.to.x,height,door.to.z),d=b.clone().sub(a)
  return {physical:f.g.physics.raycast(a,d.clone().normalize(),d.length()),
    visual:new f.T.Raycaster(a,d.clone().normalize(),0,d.length()).intersectObject(f.shutters.root,true)}
}

if(isMain(import.meta.url)){
test('M5 two native warehouse entrances are physically sealed until host starts, retaining original scenery and colliders',t=>{
  const f=nativeChapter5Fixture(),{g,T,shutters,originals}=f
  shutters.update(100)
  assert.deepEqual(shutters.capture(),{started:false,progress:0});assert.equal(shutters.snapshot().phase,'closed')
  assert.equal(shutters.colliders.length,2)
  for(const door of approaches){
    assert.equal(g.physics.nav.isWalkable(door.centre.x,door.centre.z),false)
    for(const height of [.4,1.3,2.2,3.8]){
      assert.equal(rays(f,door,height).physical?.box?.tag,`campaign-ch5-warehouse-${door.id}`)
      assert.ok(rays(f,door,height).visual.length)
    }
    for(const reverse of [false,true]){
      const [a,b]=reverse?[door.to,door.from]:[door.from,door.to],pos=new T.Vector3(a.x,.03,a.z),d=new T.Vector3(b.x-a.x,0,b.z-a.z)
      assert.equal(g.physics.moveCapsule(pos,d,1,.32,1.15).hitWall,true)
    }
  }
  assert.equal(g.physics.nav.findPath(approaches[0].from,approaches[0].to),null,'Alternate doorway allowed entering before initialization')
  for(const {box,min,max}of originals){assert.ok(g.physics.boxes.includes(box));assert.deepEqual(box.min,min);assert.deepEqual(box.max,max)}
  t.diagnostic(JSON.stringify({doors:shutters.snapshot(),originalColliders:originals.length,retainedWarehouseLights:f.warehouse.lights.length}))
})

test('M5 raised shutters admit crouch then standing through both original apertures and clear native nav/LOS',()=>{
  const f=nativeChapter5Fixture(),{g,shutters}=f
  assert.equal(shutters.start(),true);assert.equal(shutters.start(),false);shutters.update(1.6)
  assert.equal(shutters.snapshot().phase,'opening');assert.ok(Math.abs(shutters.snapshot().lift-1.2)<1e-9)
  for(const door of approaches){
    assert.equal(rays(f,door,1.05).physical,null);assert.equal(rays(f,door,1.05).visual.length,0)
    for(const reverse of [false,true])capsulePath(g,reverse?[door.to,door.from]:[door.from,door.to],`${door.id}/crouch/${reverse}`,1.15)
    assert.equal(rays(f,door,1.8).physical?.box?.tag,`campaign-ch5-warehouse-${door.id}`)
  }
  shutters.update(1)
  assert.equal(shutters.snapshot().phase,'opening')
  for(const door of approaches){
    assert.equal(g.physics.nav.isWalkable(door.centre.x,door.centre.z),true)
    navPath(g,door.from,door.to,`${door.id}/nav`)
    for(const reverse of [false,true])capsulePath(g,reverse?[door.to,door.from]:[door.from,door.to],`${door.id}/standing/${reverse}`)
  }
  shutters.update(10);assert.equal(shutters.snapshot().phase,'open')
  for(const door of approaches){assert.equal(rays(f,door,1.8).physical,null);assert.equal(rays(f,door,3.5).physical?.box?.tag,`campaign-ch5-warehouse-${door.id}`)}
  navPath(g,approaches[0].from,p(-2,-18),'south-to-control');navPath(g,approaches[1].from,p(-2,-18),'east-to-control')
})

test('M5 native player releases crouch under rising shutters and stands after clearance without a closing crush',t=>{
  const results=[]
  for(const door of approaches){
    const f=nativeChapter5Fixture(),{g,T,shutters}=f
    g.camera=new T.PerspectiveCamera();g.render=null;g.events={emit(){},on(){},off(){}}
    g.enemies={raycast:()=>null};g.game={state:'playing',run:{time:0}};g.time={frame:0}
    g.input={down:()=>false,pressed:()=>false,look:{dx:0,dy:0},move:{x:0,y:1},sprint:false,crouch:true,fire:false,ads:false}
    g.player=f.createPlayer(g);g.player.reset({pos:new T.Vector3(door.from.x,0,door.from.z),yaw:door.id==='south'?0:Math.PI/2})
    shutters.start();shutters.update(1.6)
    let released=false,entered=false
    for(let i=0;i<180;i++){
      const distance=door.id==='south'?g.player.pos.z-door.centre.z:g.player.pos.x-door.centre.x
      if(distance<.15){g.input.crouch=false;released ||= g.player.crouching}
      g.time.frame++;g.game.run.time+=1/60;g.player.update(1/60);shutters.update(1/60)
      if(distance<-.8){entered=true;break}
    }
    assert.ok(released);assert.ok(entered);assert.equal(g.player.crouching,false);assert.equal(g.player.health,100)
    results.push({door:door.id,feet:g.player.pos.toArray(),phase:shutters.snapshot().phase})
  }
  t.diagnostic(JSON.stringify(results))
})

test('M5 warehouse JSON restore/reset keeps live boxes, stable geometry and bounded nav rebuilds',()=>{
  const f=nativeChapter5Fixture(),{g,shutters}=f,handles=[...shutters.colliders]
  const resources=[];shutters.root.traverse(object=>{if(object.isMesh)resources.push(object.geometry,object.material)})
  shutters.start();shutters.update(1.6);const saved=json(shutters.capture())
  shutters.update(10);shutters.reset(saved);assert.deepEqual(json(shutters.capture()),saved)
  shutters.reset();assert.deepEqual(shutters.capture(),{started:false,progress:0})
  for(const door of approaches)assert.equal(g.physics.nav.isWalkable(door.centre.x,door.centre.z),false)
  const build=g.physics.build.bind(g.physics);let builds=0
  g.physics.build=()=>{builds++;build()};shutters.start()
  for(let i=0;i<241;i++)shutters.update(1/60)
  assert.equal(builds,1);assert.equal(shutters.snapshot().phase,'open')
  const after=[];shutters.root.traverse(object=>{if(object.isMesh)after.push(object.geometry,object.material)})
  assert.deepEqual(after,resources)
  for(const [i,box]of handles.entries()){assert.equal(shutters.colliders[i],box);assert.ok(g.physics.boxes.includes(box))}
})
}
