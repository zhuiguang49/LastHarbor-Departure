import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {parse} from '@babel/parser'
import {test} from 'node:test'
import {createInfrastructure} from './infrastructure-state.mjs'
import {createChapter5DepartureView} from './campaign-ch5-departure-view.mjs'

const bytes=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'),'9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html=bytes.toString(),source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')),body=parse(source).program.body[0].expression.callee.body.body
const boot=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='gM')),nodes=body.filter(n=>n.end<=boot.start)
const prefix=source.slice(nodes[0].start,nodes.at(-1).end)
const native=vm.runInNewContext(`(()=>{${prefix};return {T:lt,backdrop:Eb,physics:d3,player:x_,rng:il}})()`,{console,performance,AbortController},{timeout:15000})
const infrastructureSource=await fs.readFile(new URL('./infrastructure.mjs',import.meta.url),'utf8'),dom={style:{},querySelector(){return this},setAttribute(){},prepend(){}}
const installInfrastructure=vm.runInNewContext(`(()=>{${infrastructureSource.slice(infrastructureSource.indexOf('export function')).replace('export function','function')};return installInfrastructure})()`,{
  createInfrastructure,installPowerLighting:()=>({update(){},reset(){},snapshot:()=>({fixtures:[]})}),
  document:{querySelector:()=>dom,createElement:()=>dom,createTreeWalker:()=>({nextNode:()=>false})},NodeFilter:{SHOW_TEXT:4},
})
const json=value=>JSON.parse(JSON.stringify(value)),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`)
const campaignSource=await fs.readFile(new URL('./campaign-m2.mjs',import.meta.url),'utf8')
const campaignNode=parse(campaignSource,{sourceType:'module'}).program.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='installCampaignM2').declaration
const prepareNode=campaignNode.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='prepareReset')

function fixture(){
  const T=native.T,materials=new Map(),texture=new T.Texture(),g={THREE:T,scene:new T.Scene(),rng:native.rng(4207)}
  const get=(name,options={})=>{const key=name+JSON.stringify(options);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({name,map:texture,vertexColors:!!options.vertexColors}));return materials.get(key)}
  g.mats={get,decal:name=>({material:get(name),aspect:1}),label:(text,options)=>({material:get(text,options),aspect:Math.max(1,text.length*.55)}),emissive:(color,intensity)=>{const m=get(`light:${color}:${intensity}`);m.emissive.set(color);m.emissiveIntensity=intensity;return m}}
  g.physics=native.physics(g);g.level={objectives:[],shedLights:[],extraction:{pos:new T.Vector3(29,0,20)}}
  g.backdrop=native.backdrop(g)
  g.camera=new T.PerspectiveCamera(74,16/9,.08,900);g.viewCamera=new T.PerspectiveCamera(54,16/9,.01,10)
  const rendered=[]
  g.render={post:{fade:0},frame(dt){g.viewCamera.position.copy(g.camera.position);g.viewCamera.quaternion.copy(g.camera.quaternion)
    rendered.push({dt,camera:g.camera.position.toArray(),boat:g.backdrop.boat.position.toArray(),fade:this.post.fade})}}
  g.time={frame:0};g.game={state:'playing',run:{time:0}};g.hud={setMarkers(){}};g.audio={loop:()=>({stop(){}})}
  g.events={on(){},emit(){}};g.enemies={raycast:()=>null}
  g.input={look:{dx:0,dy:0},move:{x:0,y:0},pressed:()=>false,down:()=>false,sprint:false,crouch:false,ads:false,fire:false}
  g.player=native.player(g);g.player.reset({pos:new T.Vector3(29,0,20),yaw:-Math.PI/2});g.player.enabled=false
  const environment={settings:{},lamps:[],mesh(geometry,material,position,parent){const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);parent.add(mesh);return mesh},
    lamp(position,color,intensity,target){const light=new T.SpotLight(color,intensity);light.position.set(...position);light.target.position.set(...target)
      light.userData.lens=new T.Mesh(new T.PlaneGeometry(.29,.12),new T.MeshStandardMaterial({color,emissive:color}));g.scene.add(light);return light}}
  const systems=installInfrastructure(g,environment),originalFrame=g.render.frame,view=createChapter5DepartureView(g)
  const tick=(age,{dt=.05,fade=0,phase='departure',paused=false}={})=>{
    g.game.state=paused?'paused':'playing';g.time.frame++;g.game.run.time+=paused?0:dt
    systems.updatePower(dt);view.update(age,{phase,fade})
    if(!paused){g.player.update(dt);g.backdrop.update(dt)}
    g.render.frame(dt)
  }
  return {g,T,systems,view,rendered,originalFrame,tick}
}

test('new-run player reset must keep its CH1 camera when the old departure releases the view',()=>{
  const {g,T,view,tick}=fixture()
  view.start();tick(21.5,{phase:'FINISHED',fade:1})
  const prepare=vm.runInNewContext(`let retryRequested=false,retrySave=null,chapter3Trial=false,chapter4Trial=false,chapter5Trial=false;
    (${campaignSource.slice(prepareNode.start,prepareNode.end)})`,{
    g,chapter5:{ending:{reset:()=>view.reset()}},director:{current:()=>({flags:{campaignCompleted:true}})},chapterRetry:()=>null,validateCheckpoint(){},
  })
  // Actual prepareReset -> native mM.H player reset -> campaign.reset order.
  g.game.state='complete';prepare(false)
  g.player.reset({pos:new T.Vector3(0,0,-328),yaw:0})
  const eye=g.camera.position.clone(),rotation=g.camera.quaternion.clone()
  view.reset();g.render.frame(0)
  assert.ok(g.camera.position.equals(eye),'new CH1 camera was overwritten with the old boat-side camera')
  assert.ok(g.camera.quaternion.equals(rotation))
})

test('CH5 uses the real native boat/camera and overrides the audited player/backdrop/infrastructure frame writes',()=>{
  const loop=source.slice(source.indexOf('t.renderer.setAnimationLoop(()=>'))
  assert.ok(loop.indexOf('t.game.update(p)')<loop.indexOf('u("player",p)'))
  assert.ok(loop.indexOf('u("player",p)')<loop.indexOf('u("backdrop",p)'))
  assert.ok(loop.indexOf('u("backdrop",p)')<loop.indexOf('t.render.frame(p)'))
  const {g,view,tick,rendered}=fixture(),boat=g.backdrop.boat,camera=g.camera,children=[...boat.children],geometry=[]
  boat.traverse(o=>{if(o.isMesh)geometry.push(o.geometry)})
  assert.equal(view.start(),true);assert.equal(view.start(),false)
  tick(10,{fade:.25});const shot=view.snapshot()
  assert.equal(g.backdrop.boat,boat);assert.equal(g.camera,camera);children.forEach((o,i)=>assert.equal(boat.children[i],o))
  const after=[];boat.traverse(o=>{if(o.isMesh)after.push(o.geometry)});after.forEach((o,i)=>assert.equal(o,geometry[i]))
  assert.equal(rendered.length,1);assert.deepEqual(rendered[0].camera,shot.camera);assert.deepEqual(rendered[0].boat,shot.boat)
  assert.ok(shot.boat[0]>44);close(shot.yaw,0);assert.ok(shot.forward[0]<0)
  assert.ok(g.camera.position.distanceTo(g.viewCamera.position)<1e-10)
  close(g.render.post.fade,.25);assert.equal(shot.ropesVisible,false)
  // Both original systems would overwrite the pose before our final render seam.
  g.backdrop.boat.position.x=-999;g.camera.position.set(0,0,0);g.render.frame(.05)
  assert.deepEqual(view.snapshot().boat,shot.boat);assert.deepEqual(view.snapshot().camera,shot.camera)
})

test('CH5 coast recedes with a continuous safe boat path, real collider, readable crane/masts and bounded sway',t=>{
  const {g,T,view,tick}=fixture(),samples=[],originalMin=g.backdrop.colliders.find(b=>b.surface==='rubber').min.clone()
  const staticBoxes=g.backdrop.colliders.filter(b=>b.surface!=='rubber')
  view.start();let lastX=0,lastDistance=0
  const landmarks={masts:[[17,13.2,18.6],[26.6,13.2,-28.7],[-23.4,13.2,21.4]],crane:[[18.5,21.2,-5.4],[28.5,21.2,5.4]]}
  for(let age=0;age<=22;age+=.1){
    tick(age);const s=view.snapshot(),distance=g.camera.position.distanceTo(new T.Vector3(18.5,8,-3))
    assert.ok(s.boat[0]>=lastX);lastX=s.boat[0]
    if(age>2)assert.ok(distance>=lastDistance-.001);lastDistance=distance
    assert.ok(Math.abs(s.boat[1]+1.6)<.12);assert.ok(Math.abs(s.hull[0])<.1&&Math.abs(s.hull[2])<.05)
    assert.ok(s.collider.min[0]>=30,'rotating stern must clear original quay edge')
    for(const b of staticBoxes)assert.ok(!(s.collider.max[0]>b.min.x&&s.collider.min[0]<b.max.x&&s.collider.max[1]>b.min.y&&s.collider.min[1]<b.max.y&&s.collider.max[2]>b.min.z&&s.collider.min[2]<b.max.z),'boat intersects native backdrop')
    if(Math.abs(age-2)<.01||Math.abs(age-10)<.01||Math.abs(age-20)<.01){
      const visible={}
      for(const [kind,points]of Object.entries(landmarks))visible[kind]=points.filter(p=>{const ndc=new T.Vector3(...p).project(g.camera);return Math.abs(ndc.x)<.98&&Math.abs(ndc.y)<.98&&ndc.z<1}).length
      assert.ok(visible.masts>=1,'mast projection');assert.ok(visible.crane>=1,'crane projection');samples.push({age,camera:s.camera,boat:s.boat,visible})
    }
  }
  assert.ok(g.backdrop.colliders.find(b=>b.surface==='rubber').min.x>originalMin.x+20)
  t.diagnostic(JSON.stringify(samples))
})

test('CH5 paused view is pose-identical and reset/new game restores borrowed resources and the original render chain',()=>{
  const {g,view,tick,originalFrame}=fixture(),boat=g.backdrop.boat,home={position:boat.position.clone(),quaternion:boat.quaternion.clone(),base:g.backdrop.boatBase.clone(),
    hull:boat.children[0].rotation.clone(),ropes:boat.children[1].visible,boxes:g.backdrop.colliders.map(b=>({box:b,min:b.min.clone(),max:b.max.clone()}))}
  view.start();tick(12,{phase:'fade',fade:.4});const paused=json(view.snapshot())
  for(let i=0;i<8;i++)tick(15+i,{paused:true,fade:1})
  assert.deepEqual(json(view.snapshot()),paused)
  g.game.state='playing';tick(20,{phase:'complete',fade:1});close(g.render.post.fade,1)
  view.reset();assert.equal(view.snapshot().active,false);assert.ok(boat.position.equals(home.position));assert.ok(boat.quaternion.equals(home.quaternion));assert.ok(g.backdrop.boatBase.equals(home.base))
  assert.ok(boat.children[0].rotation.equals(home.hull));assert.equal(boat.children[1].visible,home.ropes)
  for(const {box,min,max}of home.boxes){assert.ok(box.min.equals(min));assert.ok(box.max.equals(max))}
  close(g.render.post.fade,0)
  assert.equal(view.start(),true);tick(0);assert.ok(boat.position.equals(home.position));view.dispose();view.dispose()
  assert.equal(g.render.frame,originalFrame);assert.equal(view.start(),false)
  g.backdrop.update(.5);g.render.frame(.05);assert.equal(boat.position.x,home.position.x)
})
