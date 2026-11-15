import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {parse} from '@babel/parser'
import {test} from 'node:test'
import {isMain} from './campaign-ch2.check.mjs'
import {CH5_NATIVE_ADAPTERS} from './campaign-ch5-native-adapters.mjs'
import {createChapter5Combat} from './campaign-ch5-combat.mjs'
import {installChapter5Native} from './campaign-ch5-native.mjs'
import {installCharacterTarget} from './character-native-target.mjs'

const bytes=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'),'9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html=bytes.toString(),source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const body=parse(source).program.body[0].expression.callee.body.body
const boot=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='gM'))
const nodes=body.filter(n=>n.end<=boot.start),start=nodes[0].start
const edits=CH5_NATIVE_ADAPTERS.map(adapter=>{
  const node=nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name===adapter.scope)
  assert.ok(node);let value=source.slice(node.start,node.end)
  for(const [before,after]of adapter.replacements){assert.equal(value.split(before).length,2,adapter.name);value=value.replace(before,after)}
  return {start:node.start-start,end:node.end-start,value}
})
let prefix=source.slice(start,nodes.at(-1).end)
for(const edit of edits.sort((a,b)=>b.start-a.start))prefix=prefix.slice(0,edit.start)+edit.value+prefix.slice(edit.end)
assert.equal(prefix.split('G.owner=C,G.ownerId=C?.id').length,2)
parse(prefix)
const native=vm.runInNewContext(`(()=>{${prefix};return {T:lt,physics:d3,enemies:Em,combat:zv,rng:il}})()`,{console,performance,AbortController},{timeout:15000})

export async function robotFixture({hooks=true}={}){
  const T=native.T,handlers=new Map(),events=[],loops=new Set(),materials=new Map(),texture=new T.Texture()
  const get=name=>{if(!materials.has(name))materials.set(name,new T.MeshStandardMaterial({name,map:texture}));return materials.get(name)}
  const g={THREE:T,scene:new T.Scene(),rng:native.rng(4207),params:{},game:{state:'playing',run:{time:0}},time:{frame:0},
    mats:{get,label:text=>({material:get(text),aspect:3}),emissive:(color,intensity)=>new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity)})},
    events:{on(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn)},off(name,fn){handlers.get(name)?.delete(fn)},
      emit(name,data){events.push({name,data});for(const fn of [...handlers.get(name)||[]])fn(data)}},
    level:{coverPoints:[],interiorBoxes:[]},render:{lightPool:{acquire:()=>null,flash(){}}},
    audio:{loop(){const loop={setPos(){},setGain(){},setPitch(){},stop(){loops.delete(loop)}};loops.add(loop);return loop}},
    fx:Object.fromEntries(['smoke','sparks','dust','explosion','debris','tracer','muzzleFlash'].map(k=>[k,()=>{}])),
  }
  const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
  g.player={id:'player',pos:v(25,0,25),eye:v(25,1.65,25),vel:v(),forward:v(0,0,-1),alive:true,enabled:true,onGround:true,health:1000,
    damage(n){this.health-=n;if(this.health<=0)this.alive=false},captureCampaignCollider(){return {position:this.pos,radius:.32,height:this.crouching?1.15:1.8}}}
  g.camera=new T.PerspectiveCamera();g.camera.position.copy(g.player.eye)
  g.physics=native.physics(g);g.physics.build();g.combat=native.combat(g);g.enemies=await native.enemies(g)
  let active=true
  const combat=createChapter5Combat(g,{active:()=>active,contains:p=>p.x>=-39&&p.x<=29&&p.z>=-29&&p.z<=29})
  const bridge=hooks?installChapter5Native(g,{combat,active:()=>active}):null
  const people=[]
  function person(id,kind,position,forward=v(0,0,-1)){
    const root=new T.Group();root.position.copy(position);g.scene.add(root)
    const mesh=new T.Mesh(new T.BoxGeometry(.6,1.8,.6),new T.MeshBasicMaterial());mesh.position.y=.9;root.add(mesh)
    mesh.computeBoundingSphere=()=>mesh.geometry.computeBoundingSphere()
    const target=installCharacterTarget(g,{root,mesh,skeleton:{update(){}}},{animation:{playClip(){},stop(){},update(){},finished:()=>true},clipFor:()=>0})
    target.actor.id=id;target.actor.type=kind;const actor=target.actor
    const release=combat.register({actor,kind,collider:()=>({position:actor.pos,radius:.32,height:1.8}),
      eye:()=>actor.pos.clone().add(v(0,1.5,0)),forward:()=>forward.clone()})
    people.push({target,release,root});return actor
  }
  return {g,T,v,combat,bridge,events,loops,person,setActive(value){active=value},
    tick(dt=.05){g.time.frame++;g.game.run.time+=dt;combat.update(dt);g.enemies.update(dt)},
    advance(seconds){for(let t=0;t<seconds-1e-9;t+=.05)this.tick(Math.min(.05,seconds-t))},
    dispose(){bridge?.dispose();for(const p of people){p.release();p.target.dispose();p.root.removeFromParent()}combat.dispose();g.enemies.clear()},
  }
}

if(isMain(import.meta.url))test('M5 AST adapters match exact immutable top-level factories and parse with native pool shapes unchanged',async()=>{
  const f=await robotFixture({hooks:false})
  assert.equal(CH5_NATIVE_ADAPTERS.length,3)
  assert.equal(f.g.enemies.debug.hounds.length,8);assert.equal(f.g.enemies.debug.gulls.length,10);assert.equal(f.g.enemies.debug.bolts.length,32)
  f.dispose()
})
