import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {parse} from '@babel/parser'
import {test} from 'node:test'
import {createInfrastructure} from './infrastructure-state.mjs'
import {createCampaignState,applyCampaignEvent} from './campaign-state.mjs'
import {chapter5ReadyToBoard,installChapter5Ending,CH5_BOARDING_PROMPT} from './campaign-ch5-ending.mjs'

const bytes=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'),'9e55b5200b088adaf8e1152da04efc0d3b25e236e6baf2dee96f81e23e084966')
const html=bytes.toString(),source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const body=parse(source).program.body[0].expression.callee.body.body,boot=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='gM'))
const nodes=body.filter(n=>n.end<=boot.start),prefix=source.slice(nodes[0].start,nodes.at(-1).end)
const native=vm.runInNewContext(`(()=>{${prefix};return {T:lt,backdrop:Eb,physics:d3,rng:il}})()`,{console,performance,AbortController},{timeout:15000})
const infrastructureSource=await fs.readFile(new URL('./infrastructure.mjs',import.meta.url),'utf8')
const domPort={style:{},querySelector(){return this},setAttribute(){},prepend(){}}
const installInfrastructure=vm.runInNewContext(`(()=>{${infrastructureSource.slice(infrastructureSource.indexOf('export function')).replace('export function','function')};return installInfrastructure})()`,{
  createInfrastructure,installPowerLighting:()=>({update(){},reset(){},snapshot:()=>({fixtures:[]})}),
  document:{querySelector:()=>domPort,createElement:()=>domPort,createTreeWalker:()=>({nextNode:()=>false})},NodeFilter:{SHOW_TEXT:4},
})
const json=value=>JSON.parse(JSON.stringify(value))
const readyFlags=()=>Object.fromEntries(['blackboxEntered','berth6Reached','chapter3Completed','chapter4Completed','accessCredentialObtained',
  'chapter5Entered','chapter5IntroRead','power7Stable','warehouseInitializationStarted','warehouseUnlocked','warehousePhysicallyOpen'].map(key=>[key,true]))
const readyFuel=()=>({controlAuthorized:true,fuelStarted:true,faultTriggered:true,faultReportConfirmed:true,repaired:true,elapsed:120})

// Real native boat, physics and infrastructure gate; game/HUD/audio are explicit
// recording ports. This exercises controller wiring, not a GPU or full playthrough.
function fixture(){
  const T=native.T,v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),materials=new Map(),texture=new T.Texture()
  const get=(name,options={})=>{const key=name+JSON.stringify(options);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({name,map:texture,vertexColors:!!options.vertexColors}));return materials.get(key)}
  const g={THREE:T,scene:new T.Scene(),rng:native.rng(4207)}
  g.mats={get,decal:name=>({material:get(name),aspect:1}),label:(text,options)=>({material:get(text,options),aspect:Math.max(1,text.length*.55)}),
    emissive:(color,intensity)=>{const m=get(`light:${color}:${intensity}`);m.emissive.set(color);m.emissiveIntensity=intensity;return m}}
  g.physics=native.physics(g);g.level={objectives:[],shedLights:[],extraction:{pos:v(29,0,20),radius:1.6}}
  g.backdrop=native.backdrop(g);g.camera=new T.PerspectiveCamera(74,16/9,.08,900)
  const handlers=new Map(),keys=new Set(),calls={originalUpdates:0,simulation:0,reload:0,cancels:0,stops:0,fx:0,complete:0,radio:[],messages:[],hudDts:[],rendered:[],events:[],loops:[],noise:[]}
  g.events={on(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn)},off(name,fn){handlers.get(name)?.delete(fn)},
    emit(name,event){for(const fn of [...handlers.get(name)||[]])fn(event)}}
  const element=(text='',className='')=>({textContent:text,style:{display:'original'},classList:{contains:name=>name===className}})
  const who=element('指挥中心'),fields=Object.fromEntries(['.m-h','.m-k','[data-f="rating"]','.m-stats','.m-rating span'].map(key=>[key,element(key)]))
  const screen={querySelector:key=>fields[key]},messageNode=element('','h-msg'),hudNode=element(),hudNode2=element()
  const oldGlobals={document:globalThis.document,addEventListener:globalThis.addEventListener,removeEventListener:globalThis.removeEventListener}
  globalThis.document={querySelector:key=>key==='.comms-who'?who:key==='.m-debrief'?screen:null}
  globalThis.addEventListener=(name,fn)=>{if(name==='keydown')keys.add(fn)}
  globalThis.removeEventListener=(name,fn)=>{if(name==='keydown')keys.delete(fn)}
  let duringUpdate=null,pausePressed=false,emitAllowed=true,state={...createCampaignState(),currentChapter:'CH5',flags:{...createCampaignState().flags,...readyFlags()}},ending
  let messageRemaining=0,radioRemaining=0,audioPaused=false,weaponVisible=true
  g.input={move:{x:0,y:0},look:{dx:0,dy:0},fire:false,ads:false,gameplay:true,
    setGameplay(value){this.gameplay=value},pressed:action=>action==='pause'&&pausePressed}
  g.player={pos:v(29,0,20),eye:v(29,1.68,20),vel:v(),alive:true,enabled:true,invulnerable:false,health:76,
    damage(amount){this.health-=amount}}
  g.camera.position.copy(g.player.eye)
  g.weapon={state:'idle',setVisible:value=>{weaponVisible=value},reloadNow(){calls.reload++;return true},equipmentView:{cancelActions(){calls.cancels++}}}
  g.fx={clear(){calls.fx++}}
  g.render={post:{fade:.12},frame(dt){calls.rendered.push({dt,fade:this.post.fade,boat:g.backdrop.boat.position.toArray(),camera:g.camera.position.toArray()})}}
  g.hud={root:{children:[hudNode,messageNode,hudNode2]},setMarkers(){},show(value){this.visible=value},setPrompt(value){this.prompt=value},
    clearRadio(){radioRemaining=0},update(dt){weaponVisible=true;calls.hudDts.push(dt);messageRemaining=Math.max(0,messageRemaining-dt);radioRemaining=Math.max(0,radioRemaining-dt)},
    radio(text,seconds){calls.radio.push({text,seconds,sender:who.textContent,at:ending?.capture().elapsed??0});radioRemaining=seconds},
    message(text,seconds){calls.messages.push({text,seconds,at:ending?.capture().elapsed??0});messageRemaining=text?seconds:0}}
  const bus={name:'original-near'},audioNode=()=>({connect(destination){this.destination=destination},disconnect(){this.disconnected=true}})
  const ctx={sampleRate:1000,createBuffer:(channels,size)=>({getChannelData:()=>new Float32Array(size)}),
    createBufferSource(){const node={...audioNode(),start(){this.started=true},stop(){this.stopped=true;this.onended?.()}};calls.noise.push(node);return node},
    createBiquadFilter:()=>({...audioNode(),frequency:{},Q:{}}),createGain:()=>({...audioNode(),gain:{}})}
  g.audio={ctx,meleeBus:bus,setPaused:value=>{audioPaused=value},play(){},loop(name,options){const loop={name,options,stopped:false,
    setPos(position){this.position=position.clone()},setPitch(value){this.pitch=value},stop(){this.stopped=true}};calls.loops.push(loop);return loop}}
  const change=next=>{const prev=g.game.state;g.game.state=next;g.events.emit('game:state',{state:next,prev})}
  g.game={state:'playing',flow:{manualDialogue:false},run:{time:0,queue:[{type:'queued-patrol'}]},
    update(dt){calls.originalUpdates++;if(this.state==='paused'){if(pausePressed)this.resume();return false}
      if(this.state!=='playing')return false;this.run.time+=dt;duringUpdate?.();return true},
    pause(){g.audio.setPaused(true);change('paused')},resume(){g.player.enabled=true;g.input.setGameplay(true);g.weapon.setVisible(true);g.audio.setPaused(false);change('playing')},
    completeCampaign(){assert.equal(g.render.post.fade,1);assert.equal(ending.canFinish(),true)
      assert.equal(state.flags.campaignCompleted,true);calls.complete++;change('complete');return true}}
  const environment={settings:{},lamps:[],mesh(geometry,material,position,parent){const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);parent.add(mesh);return mesh},
    lamp(position,color,intensity,target){const light=new T.SpotLight(color,intensity);light.position.set(...position);light.target.position.set(...target)
      light.userData.lens=new T.Mesh(new T.PlaneGeometry(.29,.12),new T.MeshStandardMaterial({color,emissive:color}));g.scene.add(light);return light}}
  const systems=installInfrastructure(g,environment),warehouseState={phase:'open'},fuelState=readyFuel()
  systems.requestPower();systems.updatePower(1.5);systems.state.gate='OPERATING';systems.updatePower(2.5)
  const facilities={capture:()=>({gate:systems.state.gate,gateProgress:systems.state.gateProgress})},warehouse={snapshot:()=>({...warehouseState})},fuel={capture:()=>({...fuelState})}
  const battle={stopForDeparture(){calls.stops++}},original={gameUpdate:g.game.update,hudUpdate:g.hud.update,radio:g.hud.radio,message:g.hud.message,
    damage:g.player.damage,reload:g.weapon.reloadNow,frame:g.render.frame}
  const emit=event=>{if(!emitAllowed)return false;const next=applyCampaignEvent(state,event);if(next===state)return false;state=next;calls.events.push({...event});return true}
  ending=installChapter5Ending(g,{systems,warehouse,facilities,fuel,battle,flags:()=>state.flags,emit})
  function frame(dt=.05,{render=true}={}){
    if(g.game.update(dt)!==false&&g.game.state==='playing')calls.simulation++
    ending.update(dt);g.hud.update(dt);if(ending.started())assert.equal(weaponVisible,false,'Ending hides the gun after native equipment HUD sync');if(render)g.render.frame(dt)
  }
  return {g,T,v,ending,calls,original,systems,facilities,warehouseState,fuelState,fields,who,hudNode,messageNode,frame,
    flags:()=>state.flags,place(x,y,z){g.player.pos.set(x,y,z);g.player.eye.set(x,y+1.68,z);g.camera.position.copy(g.player.eye)},
    during(fn){duringUpdate=fn},pauseInput(value){pausePressed=value},allowEmit(value){emitAllowed=value},audioPaused:()=>audioPaused,
    visible:()=>weaponVisible,timers:()=>({messageRemaining,radioRemaining}),key(code){const e={code,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};for(const fn of keys)fn(e);return e},
    listenerCount:()=>keys.size+(handlers.get('game:state')?.size||0),
    dispose(){ending.dispose();Object.assign(globalThis,oldGlobals)
      const geometries=new Set(),allMaterials=new Set();g.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])allMaterials.add(m)})
      for(const geometry of geometries)geometry.dispose();for(const material of allMaterials)material.dispose();texture.dispose();g.scene.clear()}}
}

const readiness=()=>[readyFlags(),{power:'ON'},{phase:'open'},{gate:'OPEN',gateProgress:1},readyFuel()]
test('CH5 readiness requires power, real warehouse/boat gates, control authorization and all 120 repaired fuel seconds',()=>{
  assert.equal(chapter5ReadyToBoard(...readiness()),true)
  for(const [index,key,value]of [[0,'chapter4Completed',false],[0,'chapter5Entered',false],[0,'chapter5IntroRead',false],
    [0,'power7Stable',false],[1,'power','OFF'],[0,'warehousePhysicallyOpen',false],[2,'phase','opening'],
    [3,'gate','OPERATING'],[3,'gateProgress',.999],[4,'controlAuthorized',false],[4,'fuelStarted',false],
    [4,'repaired',false],[4,'elapsed',119.999],[4,'elapsed',121]]){
    const args=readiness();args[index][key]=value;assert.equal(chapter5ReadyToBoard(...args),false,`${index}.${key}`)
  }
})

test('CH5 fuel 100% never auto-boards; only a new E at the original ladder with LOS commits once',()=>{
  const f=fixture(),{g,ending:e}=f
  try{
    assert.equal(e.ready(),true);f.frame(5);assert.equal(e.started(),false)
    const gate=g.physics.boxes.find(box=>box.tag==='harbor-moving-gate')
    assert.ok(gate.min.y>3);assert.equal(g.physics.lineOfSight(f.v(26.8,1.6,20),f.v(29,1.6,20)),true)
    for(const p of [[27.9,0,20],[29.7,0,20],[29,0,18.4],[29,0,21.6],[29,.41,20],[31.5,0,21]]){
      f.place(...p);assert.equal(e.interact(true),false);assert.equal(e.started(),false)
    }
    f.place(28.4,0,20)
    const wall=g.physics.addBox(f.v(28.6,0,19.5),f.v(28.7,3,20.5),{tag:'ending-test-los'})
    assert.equal(e.interact(true),false);g.physics.removeBox(wall)
    f.place(29,0,20);assert.equal(e.interact(false),true);assert.equal(g.hud.prompt,CH5_BOARDING_PROMPT)
    assert.equal(e.started(),false);assert.equal(f.calls.stops,0)
    for(const hold of ['paused','dead','disabled']){
      if(hold==='paused')g.game.state='paused';else if(hold==='dead')g.player.alive=false;else g.player.enabled=false
      e.interact(true);assert.equal(e.started(),false)
      g.game.state='playing';g.player.alive=true;g.player.enabled=true
    }
    f.allowEmit(false);e.interact(true);assert.equal(e.started(),false);f.allowEmit(true)
    e.interact(true);assert.equal(e.started(),true);assert.equal(e.interact(true),false)
    assert.equal(f.calls.events.filter(event=>event.type==='chapter5-boarded').length,1);assert.equal(f.calls.stops,1)
  }finally{f.dispose()}
})

test('CH5 boarding inside native game update halts this frame and holds movement, damage, reload and queued replacement work',()=>{
  const f=fixture(),{g,ending:e}=f
  try{
    g.player.damage(1);assert.equal(g.player.health,75);assert.equal(g.weapon.reloadNow(),true)
    g.player.vel.set(3,0,2);g.input.fire=g.input.ads=true;g.input.move.x=g.input.move.y=1;g.weapon.state='reload'
    f.during(()=>{f.during(null);e.interact(true)})
    const result=g.game.update(.05)
    assert.equal(result,false);assert.equal(e.started(),true);assert.equal(f.calls.originalUpdates,1)
    assert.equal(f.calls.stops,1);assert.equal(g.game.run.queue.length,0);assert.equal(f.calls.fx,1)
    assert.equal(g.player.enabled,false);assert.equal(g.player.invulnerable,true);assert.equal(g.player.vel.length(),0)
    assert.equal(g.input.gameplay,false);assert.equal(g.input.fire,false);assert.equal(g.input.ads,false)
    assert.equal(g.input.move.x+g.input.move.y,0);assert.equal(f.visible(),false);assert.equal(g.weapon.state,'idle')
    assert.ok(f.calls.cancels>=1);assert.equal(g.game.flow.manualDialogue,true)
    g.player.damage(1000);assert.equal(g.player.health,75);assert.equal(g.weapon.reloadNow(),false);assert.equal(f.calls.reload,1)
    assert.equal(f.key('KeyR').prevented,true);assert.equal(f.key('KeyW').stopped,true)
    assert.equal(f.key('KeyP').prevented,undefined)
    g.hud.radio('unrelated combat radio',4);g.hud.message('unrelated combat message',4)
    assert.equal(f.calls.radio.length,0);assert.ok(!f.calls.messages.some(line=>line.text==='unrelated combat message'))
    for(let i=0;i<5;i++)f.frame(.05)
    assert.equal(f.calls.simulation,0);assert.equal(f.calls.originalUpdates,1);assert.equal(f.calls.stops,1)
    assert.equal(f.hudNode.style.display,'none');assert.equal(f.messageNode.style.display,'original')
  }finally{f.dispose()}
})

test('CH5 pause/resume preserves cue timers, boat pose and one engine without restarting departure',()=>{
  const f=fixture(),{g,ending:e}=f
  try{
    e.interact(true);for(let i=0;i<45;i++)f.frame(.05)
    assert.equal(e.capture().phase,'MONOLOGUE')
    f.pauseInput(true);f.frame(.05);f.pauseInput(false)
    assert.equal(g.game.state,'paused');assert.equal(f.audioPaused(),true)
    const before=json(e.capture()),view=json(e.snapshot().view),timers=f.timers(),runTime=g.game.run.time,loops=f.calls.loops.length
    for(let i=0;i<5;i++)f.frame(100)
    assert.deepEqual(e.capture(),before);assert.deepEqual(json(e.snapshot().view),view)
    assert.deepEqual(f.timers(),timers);assert.equal(g.game.run.time,runTime);assert.equal(f.calls.hudDts.at(-1),0)
    g.game.resume();assert.equal(g.player.enabled,false);assert.equal(g.input.gameplay,false);assert.equal(f.visible(),false)
    f.frame(.05);assert.ok(e.capture().elapsed>before.elapsed);assert.equal(f.audioPaused(),false)
    assert.equal(f.calls.loops.length,loops);assert.equal(f.calls.stops,1);assert.equal(e.interact(true),false)
    assert.equal(f.calls.messages.filter(line=>line.text==='许工……船真的还在。').length,1)
  }finally{f.dispose()}
})

test('CH5 exact HUD/radio sequence clears before silence and native completion waits for a rendered full fade',()=>{
  const f=fixture(),{g,ending:e}=f
  try{
    e.interact(true)
    for(let i=0;i<429;i++)f.frame(.05)
    assert.equal(e.capture().finished,false);assert.equal(f.calls.complete,0);assert.ok(g.render.post.fade<1)
    f.frame(.05,{render:false})
    assert.equal(e.capture().finished,true);assert.equal(e.capture().phase,'FINISHED')
    assert.equal(e.snapshot().view.fade,1);assert.ok(g.render.post.fade<1)
    assert.equal(e.canFinish(),false);assert.equal(f.calls.complete,0);assert.equal(f.flags().campaignCompleted,false)
    g.render.frame(.05);assert.equal(g.render.post.fade,1);assert.equal(e.canFinish(),true)
    e.update(.05);assert.equal(f.calls.complete,1);assert.equal(g.game.state,'complete')
    assert.equal(f.flags().chapter5Completed,true);assert.equal(f.flags().campaignCompleted,true)
    assert.deepEqual(f.calls.messages.filter(line=>line.text).map(line=>line.text),['许工……船真的还在。','我终于离开紫金港了。'])
    assert.deepEqual(f.calls.radio.map(line=>line.text),['警告。','第七封锁区检测到未经授权的出港船只。','目标正在离开指定管制区域。',
      '正在向中央安保网络发送海上拦截请求……','［信号中断］'])
    assert.ok(f.calls.radio.every(line=>line.sender==='DEEPTIDE SECURITY SYSTEM'))
    assert.ok(Math.abs(f.calls.radio[0].at-6.5)<1e-8);assert.equal(f.calls.noise.filter(source=>source.started).length,5)
    assert.equal(f.timers().messageRemaining,0);assert.equal(f.timers().radioRemaining,0)
    assert.equal(f.fields['[data-f="rating"]'].textContent,'你已成功离开紫金港。')
    e.update(1000);g.game.update(1000);assert.equal(f.calls.complete,1)
    assert.equal(f.calls.loops.at(-1).stopped,true);assert.ok(f.calls.noise.every(source=>source.stopped))
  }finally{f.dispose()}
})

test('CH5 reset restores borrowed presentation and normal calls; dispose restores every original function and listener',()=>{
  const f=fixture(),{g,ending:e}=f
  try{
    const home=g.backdrop.boat.position.clone(),camera=g.camera.position.clone(),frame=g.render.frame
    e.interact(true);for(let i=0;i<160;i++)f.frame(.05)
    assert.ok(g.backdrop.boat.position.distanceTo(home)>1)
    e.reset();assert.equal(e.started(),false);assert.equal(e.capture().phase,'READY')
    assert.ok(g.backdrop.boat.position.equals(home));assert.ok(g.camera.position.equals(camera));assert.equal(g.render.post.fade,.12)
    assert.equal(g.player.invulnerable,false);assert.equal(g.game.flow.manualDialogue,false)
    assert.equal(f.hudNode.style.display,'original');assert.equal(f.who.textContent,'指挥中心')
    assert.equal(f.fields['.m-h'].textContent,'.m-h');assert.equal(f.visible(),true)
    g.player.damage(1);assert.equal(g.player.health,75);assert.equal(g.weapon.reloadNow(),true)
    g.hud.message('restored',2);g.hud.radio('restored',2)
    assert.equal(f.calls.messages.at(-1).text,'restored');assert.equal(f.calls.radio.at(-1).text,'restored')
    assert.equal(g.render.frame,frame,'Reset preserves the installed render adapter for a new run')
    assert.ok(f.listenerCount()>0);e.dispose();assert.equal(f.listenerCount(),0)
    for(const [key,value]of Object.entries({gameUpdate:g.game.update,hudUpdate:g.hud.update,radio:g.hud.radio,message:g.hud.message,
      damage:g.player.damage,reload:g.weapon.reloadNow,frame:g.render.frame}))assert.equal(value,f.original[key],key)
    e.dispose();assert.equal(e.interact(true),false)
  }finally{f.dispose()}
})
