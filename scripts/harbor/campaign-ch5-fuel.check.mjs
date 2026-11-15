import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { createInfrastructure } from './infrastructure-state.mjs'
import { CH5_FUEL_SECONDS, CH5_FAULT_SECONDS, createChapter5Fuel, installChapter5Fuel } from './campaign-ch5-fuel.mjs'

const json=value=>JSON.parse(JSON.stringify(value))

// Real native Three/LOS. Narrative is an explicit two-page port: its actual
// pause/input/damage and final-Enter behavior is checked in opening-narrative.
// The campaign host owns pause gating and does not tick the mission while held.
async function fixture() {
  const {g,T}=await nativeFixture(),v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z)
  const legacy=createInfrastructure(),legacyEntry=json(legacy.snapshot())
  const flags={warehousePhysicallyOpen:true,accessCredentialObtained:true}
  const records=[],presentations=[],checkpoints=[],sounds=[],messages=[],prompts=[]
  let modal=null,gateOpens=0,rejectReport=false
  Object.assign(g,{game:{state:'playing',complete(){assert.fail('Fuel must not call the ending')}},
    player:{pos:v(),eye:v(0,1.68,0),forward:v(0,0,-1),alive:true,enabled:true},
    events:{emit(){assert.fail('Fuel must not emit departure or chapter completion')}},
    audio:{play:(...args)=>sounds.push(args)},hud:{setPrompt:p=>prompts.push(p),message:(...args)=>messages.push(args)}})
  const targets={control:v(0,1,0),fuel:v(10,1,0),repair:v(20,1,0)}
  const facilities={targets,openBoatGate(){gateOpens++}}
  const systems={state:legacy.state,presentChapter5Fuel(dt,value){presentations.push({dt,value:value?{...value}:null})},
    request(){assert.fail('Campaign fuel must not request legacy devices')},update(){assert.fail('Campaign fuel must not tick the legacy sequence')}}
  function open(kind,{onComplete}) {
    if(modal||rejectReport)return false
    modal={kind,onComplete,page:0,active:true};records.push(modal)
    g.game.state='paused';g.player.enabled=false;return true
  }
  function cancel(kind) {
    if(!modal||modal.kind!==kind)return false
    modal.active=false;modal=null;return true
  }
  const narrative={openChapter5Control:options=>open('control',options),openChapter5Fault:options=>open('fault',options),
    cancelChapter5Control:()=>cancel('control'),cancelChapter5Fault:()=>cancel('fault'),snapshot:()=>({active:!!modal})}
  const fuel=installChapter5Fuel(g,{systems,facilities,narrative,flags:()=>flags,onCheckpoint:()=>checkpoints.push(json(fuel.capture()))})
  function at(kind){const target=targets[kind];g.player.pos.set(target.x,0,target.z+1.1);g.player.eye.copy(g.player.pos).y+=1.68
    g.player.forward.copy(target).sub(g.player.pos).setY(0).normalize()}
  function tick(dt){if(g.game.state==='playing'&&g.player.alive&&g.player.enabled&&!modal&&Number.isFinite(dt)&&dt>0)fuel.update(dt);else fuel.pause()}
  function confirm(){
    if(!modal||modal.page!==1)return false
    const current=modal;current.onComplete({skipped:false})
    if(modal===current){current.active=false;modal=null;g.game.state='playing';g.player.enabled=true}
    return true
  }
  function next(){if(!modal)return false;modal.page=1;return true}
  function authorize(){at('control');fuel.interact(true);next();assert.equal(confirm(),true)}
  function start(){authorize();at('fuel');fuel.interact(true);assert.equal(fuel.capture().fuelStarted,true)}
  return {g,v,fuel,legacy,legacyEntry,flags,systems,narrative,targets,records,presentations,checkpoints,sounds,messages,prompts,
    at,tick,next,confirm,authorize,start,gateOpens:()=>gateOpens,modal:()=>modal,rejectReport(value){rejectReport=value},
    resume(){g.game.state='playing';g.player.enabled=true},dispose(){fuel.dispose();g.scene.clear()}}
}

test('M5-B fuel requires control authorization and one real valve start; invalid dt cannot advance it',()=>{
  const m=createChapter5Fuel(),entry=json(m.capture())
  assert.equal(CH5_FUEL_SECONDS,120);assert.equal(CH5_FAULT_SECONDS,87.6)
  assert.equal(m.start(),false);assert.equal(m.repair(),false);m.tick(1000)
  assert.deepEqual(m.capture(),entry)
  assert.equal(m.authorize(),true);assert.equal(m.authorize(),false);m.tick(1000)
  assert.equal(m.capture().elapsed,0);assert.equal(m.capture().fuelStarted,false)
  assert.equal(m.start(),true);assert.equal(m.start(),false)
  for(const dt of [0,-1,NaN,Infinity,-Infinity])assert.equal(m.tick(dt),false)
  assert.equal(m.capture().elapsed,0)
  m.tick(6);assert.equal(m.capture().elapsed,6,'The campaign pump is not the six-second sandbox pump')
  assert.equal(m.repair(),false)
  const saved=m.capture();saved.elapsed=119;assert.equal(m.capture().elapsed,6,'Capture is detached mission data')
})

test('M5-B fuel clamps crossing frames exactly at 87.6 seconds and preserves 73% until confirmed repair',()=>{
  for(const steps of [[87.55,.1],[1000],Array.from({length:1752},()=>.05)]){
    const m=createChapter5Fuel();m.authorize();m.start();let faults=0
    for(const dt of steps)faults+=Number(m.tick(dt))
    assert.equal(faults,1);assert.equal(m.capture().elapsed,87.6)
    assert.equal(m.capture().elapsed/120,.73);assert.equal(m.capture().faultTriggered,true)
    for(const dt of [1,60,1000]){assert.equal(m.tick(dt),false);assert.equal(m.capture().elapsed,87.6)}
    assert.equal(m.repair(),false,'Reaching the fault alone does not permit repair')
    m.state.faultReportConfirmed=true
    assert.equal(m.repair(),true);assert.equal(m.repair(),false)
    m.tick(32.35);assert.ok(m.capture().elapsed<120)
    m.tick(.05);assert.equal(m.capture().elapsed,120)
    m.tick(1000);assert.equal(m.capture().elapsed,120)
    assert.equal(m.capture().faultTriggered,true);assert.equal(m.capture().repaired,true)
    m.reset();assert.equal(m.start(),false);assert.equal(m.repair(),false);assert.equal(m.capture().elapsed,0)
  }
})

test('M5-B control requires credential, an open warehouse, proximity, facing, LOS and final report confirmation',async()=>{
  const f=await fixture(),{g,fuel}=f
  try{
    f.at('fuel');fuel.interact(true);assert.equal(fuel.capture().fuelStarted,false)
    f.at('repair');fuel.interact(true);assert.equal(fuel.capture().repaired,false)
    for(const key of ['warehousePhysicallyOpen','accessCredentialObtained']){
      f.flags[key]=false;f.at('control');fuel.interact(true);f.flags[key]=true
      assert.equal(f.records.length,0);assert.equal(f.gateOpens(),0)
    }
    f.at('control');g.player.forward.negate();assert.equal(fuel.interact(true),false)
    f.at('control');g.player.pos.z=3;g.player.eye.z=3;assert.equal(fuel.interact(true),false)
    f.at('control');const wall=g.physics.addBox(f.v(-1,0,.4),f.v(1,3,.6),{tag:'fuel-test-control-wall'})
    assert.equal(fuel.interact(true),false);g.physics.removeBox(wall)
    f.at('control');fuel.interact(false);assert.equal(f.records.length,0)
    fuel.interact(true);for(let i=0;i<5;i++)fuel.interact(true)
    assert.equal(f.records.length,1);assert.equal(f.modal().kind,'control')
    assert.equal(f.confirm(),false);assert.equal(fuel.capture().controlAuthorized,false)
    assert.equal(f.gateOpens(),0);assert.equal(f.checkpoints.length,0)
    f.tick(1000);f.next();f.tick(1000)
    assert.equal(fuel.capture().elapsed,0);assert.equal(fuel.capture().controlAuthorized,false)
    assert.equal(f.confirm(),true);assert.equal(fuel.capture().controlAuthorized,true)
    assert.equal(f.gateOpens(),1);assert.equal(f.checkpoints.length,1)
    f.records[0].onComplete({skipped:false});fuel.interact(true)
    assert.equal(f.gateOpens(),1);assert.equal(f.checkpoints.length,1);assert.equal(f.records.length,1)
    f.at('fuel');fuel.interact(true);fuel.interact(true);fuel.interact(false)
    assert.equal(fuel.capture().fuelStarted,true);assert.equal(f.checkpoints.length,2)
    assert.equal(f.sounds.length,2)
  }finally{f.dispose()}
})

test('M5-B host pause, disabled player and reading hold progress; field repair preserves progress and completes once',async()=>{
  const f=await fixture(),{g,fuel}=f
  try{
    f.start();f.tick(20);const before=json(fuel.capture())
    g.game.state='paused';f.tick(300);assert.deepEqual(fuel.capture(),before)
    assert.equal(f.presentations.at(-1).value.paused,true)
    f.resume();g.player.enabled=false;f.tick(300);assert.deepEqual(fuel.capture(),before)
    f.resume();g.player.alive=false;f.tick(300);assert.deepEqual(fuel.capture(),before)
    g.player.alive=true;f.resume();f.tick(67.65)
    assert.equal(fuel.capture().elapsed,87.6);assert.equal(f.modal().kind,'fault')
    const count=f.checkpoints.length
    f.at('repair');fuel.interact(true)
    assert.equal(fuel.capture().repaired,false);assert.equal(f.confirm(),false)
    for(let i=0;i<3;i++){f.tick(1000);assert.equal(fuel.capture().elapsed,87.6)}
    assert.equal(f.records.filter(r=>r.kind==='fault').length,1)
    assert.equal(f.presentations.at(-1).value.fault,true)
    assert.equal(f.presentations.at(-1).value.pumping,false)
    f.next();f.tick(1000);assert.equal(fuel.capture().faultReportConfirmed,false)
    f.confirm();assert.equal(fuel.capture().faultReportConfirmed,true)
    assert.equal(fuel.capture().repaired,false);f.tick(1000);assert.equal(fuel.capture().elapsed,87.6)
    assert.equal(f.checkpoints.length,count+1)
    f.at('repair');fuel.interact(true);fuel.interact(true)
    assert.equal(fuel.capture().repaired,true);assert.equal(fuel.capture().elapsed,87.6)
    assert.equal(f.checkpoints.length,count+2)
    assert.equal(f.messages.filter(([message])=>message==='故障已解除 · 燃油输送继续').length,1)
    f.tick(32.3);assert.ok(fuel.capture().elapsed<120);f.tick(.1)
    assert.equal(fuel.capture().elapsed,120);assert.equal(fuel.snapshot().progress,1)
    assert.equal(fuel.objective(),'燃油输送完成 · 100%')
    assert.equal(f.presentations.at(-1).value.pumping,false)
    f.tick(1000);f.at('fuel');fuel.interact(true);f.at('repair');fuel.interact(true)
    assert.equal(fuel.capture().elapsed,120);assert.equal(f.records.filter(r=>r.kind==='fault').length,1)
    assert.equal(f.messages.filter(([message])=>message==='燃油输送完成 · 100%').length,1)
    assert.equal(f.checkpoints.length,count+3)
    assert.equal(g.game.state,'playing');assert.deepEqual(f.legacy.snapshot(),f.legacyEntry)
  }finally{f.dispose()}
})

test('M5-B failed report opens can retry without authorization or bypassing the 73% fault',async()=>{
  const f=await fixture(),{fuel}=f
  try{
    f.rejectReport(true);f.at('control');fuel.interact(true)
    assert.equal(fuel.snapshot().controlPending,false);assert.equal(fuel.capture().controlAuthorized,false)
    assert.equal(f.records.length,0);assert.equal(f.gateOpens(),0)
    f.rejectReport(false);f.start();f.rejectReport(true);f.tick(1000)
    assert.equal(fuel.capture().elapsed,87.6);assert.equal(fuel.snapshot().faultPending,false)
    f.tick(1000);assert.equal(fuel.capture().elapsed,87.6)
    f.at('repair');fuel.interact(true);assert.equal(fuel.capture().repaired,false)
    f.rejectReport(false);f.tick(.05);assert.equal(f.modal().kind,'fault')
    assert.equal(f.records.filter(r=>r.kind==='fault').length,1)
  }finally{f.dispose()}
})

test('M5-B reset cancels both reports and stale callbacks cannot award a new attempt or dispose',async()=>{
  for(const kind of ['control','fault']){
    const f=await fixture(),{fuel}=f
    try{
      const initial=json(fuel.capture())
      if(kind==='control'){f.at('control');fuel.interact(true)}else{f.start();f.tick(1000)}
      const stale=f.modal(),awards=f.gateOpens(),checkpoints=f.checkpoints.length
      fuel.reset();assert.equal(stale.active,false);assert.equal(f.modal(),null)
      assert.deepEqual(fuel.capture(),initial);assert.equal(f.presentations.at(-1).value,null)
      f.resume();stale.onComplete({skipped:false})
      assert.deepEqual(fuel.capture(),initial);assert.equal(f.gateOpens(),awards);assert.equal(f.checkpoints.length,checkpoints)
      // Even if a new report of the same kind is pending, its predecessor must
      // not consume that pending state or commit the new operation for it.
      if(kind==='control'){f.at('control');fuel.interact(true)}else{f.start();f.tick(1000)}
      const current=f.modal(),pending=json(fuel.snapshot()),currentAwards=f.gateOpens(),currentCheckpoints=f.checkpoints.length
      stale.onComplete({skipped:false});assert.deepEqual(fuel.snapshot(),pending)
      assert.equal(f.gateOpens(),currentAwards);assert.equal(f.checkpoints.length,currentCheckpoints)
      fuel.dispose();f.resume();current.onComplete({skipped:false});stale.onComplete({skipped:false})
      assert.deepEqual(fuel.capture(),initial);assert.equal(f.gateOpens(),currentAwards);assert.equal(f.checkpoints.length,currentCheckpoints)
    }finally{f.dispose()}
  }
})

test('M5-B dead players cannot commit either report, and entry validation rejects progressed mission data',async()=>{
  for(const kind of ['control','fault']){
    const f=await fixture(),{fuel}=f
    try{
      const initial=json(fuel.capture())
      assert.doesNotThrow(()=>fuel.validateEntry(initial))
      for(const key of ['controlAuthorized','fuelStarted','faultTriggered','faultReportConfirmed','repaired'])
        assert.throws(()=>fuel.validateEntry({...initial,[key]:true}),/Invalid CH5 fuel entry/)
      for(const saved of [null,{...initial,version:2},{...initial,elapsed:1},{...initial,elapsed:NaN}])
        assert.throws(()=>fuel.validateEntry(saved),/Invalid CH5 fuel entry/)
      if(kind==='control'){f.at('control');fuel.interact(true)}else{f.start();f.tick(1000)}
      const before=json(fuel.capture()),awards=f.gateOpens(),count=f.checkpoints.length
      f.g.player.alive=false;f.modal().onComplete({skipped:false})
      assert.deepEqual(fuel.capture(),before);assert.equal(f.gateOpens(),awards);assert.equal(f.checkpoints.length,count)
      fuel.reset();assert.doesNotThrow(()=>fuel.validateEntry(json(fuel.capture())))
    }finally{f.dispose()}
  }
})

test('Legacy infrastructure still fills in six seconds and requires its separate boat request',()=>{
  const legacy=createInfrastructure()
  assert.equal(legacy.request('power'),true);legacy.tick(1.5)
  assert.equal(legacy.request('gate'),true);legacy.tick(2.5)
  assert.equal(legacy.request('fuel'),true);legacy.tick(5.9)
  assert.equal(legacy.state.fuel,'PUMPING');assert.ok(legacy.state.fuelProgress<1)
  legacy.tick(.1);assert.equal(legacy.state.fuelProgress,1);assert.equal(legacy.state.fuel,'READY')
  assert.equal(legacy.state.boat,'READY');assert.equal(legacy.state.departureProgress,0)
  assert.equal(legacy.request('boat'),true);legacy.tick(2.5);assert.equal(legacy.state.boat,'EXTRACTED')
})
