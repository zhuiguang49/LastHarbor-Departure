import {createChapter5RepairAsset} from './campaign-ch5-repair-asset.mjs'

export const CH5_REPAIR_SITE=Object.freeze({position:[-35,0,12],yaw:Math.PI,approach:[-35,0,10.6]})

// Borrow the existing Berth 7 relay handles, ladder enclosure and moving gate.
// The host calls infrastructure.updatePower(dt) BEFORE update(dt): its original
// 2.5-second gate clock remains the only clock. No legacy interaction is called.
export function createChapter5Facilities(g,{infrastructure,repairResources,occupants=()=>[]}={}) {
  const T=g.THREE,s=infrastructure.state,harbor=g.scene.getObjectByName('harbor-infrastructure')
  const gate=harbor?.children.find(o=>o.isGroup&&Math.abs(o.position.x-27.6)<1e-6&&Math.abs(o.position.z-20)<1e-6)
  const gateBox=g.physics.boxes.find(box=>box.tag==='harbor-moving-gate')
  if(!gate||!gateBox)throw Error('Original Berth 7 ladder gate must exist before CH5 facilities')
  const objectives=Object.fromEntries(g.level.objectives.map(o=>[o.id,o]))
  if(!objectives.relay_b||!objectives.relay_c)throw Error('Original warehouse and fuel relay handles are required')
  const cabinet=createChapter5RepairAsset(T,repairResources)
  cabinet.position.fromArray(CH5_REPAIR_SITE.position);cabinet.rotation.y=CH5_REPAIR_SITE.yaw;g.scene.add(cabinet);cabinet.updateMatrixWorld(true)
  const bounds=new T.Box3().setFromObject(cabinet)
  const cabinetBox=g.physics.addBox(bounds.min,bounds.max,{surface:'metal',tag:'campaign-ch5-repair-cabinet'})
  const relayTarget=(objective,yaw)=>objective.pos.clone().add(new T.Vector3(Math.sin(yaw)*.75,1,Math.cos(yaw)*.75))
  const targets={control:relayTarget(objectives.relay_b,.9*Math.PI/2),fuel:relayTarget(objectives.relay_c,-.2),
    repair:new T.Vector3(-35,1.25,bounds.min.z-.035)}
  const approaches={control:objectives.relay_b.pos.clone().add(new T.Vector3(Math.sin(.9*Math.PI/2)*1.65,0,Math.cos(.9*Math.PI/2)*1.65)),
    fuel:objectives.relay_c.pos.clone().add(new T.Vector3(Math.sin(-.2)*1.65,0,Math.cos(-.2)*1.65)),repair:new T.Vector3(...CH5_REPAIR_SITE.approach)}
  let disposed=false,pendingReset=null
  let signature=gateBox.min.y<=1.5&&gateBox.max.y>=.47
  g.physics.build()
  const capture=()=>({version:1,gate:s.gate,gateProgress:s.gateProgress,pendingReset:pendingReset?{...pendingReset}:null})
  function syncGate(){
    gate.position.y=s.gateProgress*3.8;gateBox.min.y=gate.position.y;gateBox.max.y=gate.position.y+3.6
    gate.updateMatrixWorld(true)
    const next=gateBox.min.y<=1.5&&gateBox.max.y>=.47
    if(signature!==next){signature=next;g.physics.build()}
  }
  function occupied(progress){
    const extra=occupants(),actors=[g.player,...(g.enemies?.list||[])]
    const bodies=extra.map(r=>r.collider).filter(Boolean)
    for(const actor of actors){
      if(!actor?.pos||actor.alive===false||actor.active===false)continue
      bodies.push(actor.captureCampaignCollider?.()||{position:actor.pos,radius:actor.type==='hound'?.65:.32,height:actor.crouching?1.15:1.8})
    }
    return bodies.some(({position:p,radius,height})=>p&&p.x+radius>gateBox.min.x&&p.x-radius<gateBox.max.x&&
      p.z+radius>gateBox.min.z&&p.z-radius<gateBox.max.z&&p.y+height>progress*3.8&&p.y<gateBox.max.y)
  }
  function reset(saved){
    const next={gate:saved?.gate||'LOCKED',gateProgress:saved?.gateProgress??0}
    if(!['LOCKED','OPERATING','OPEN'].includes(next.gate)||!Number.isFinite(next.gateProgress)||next.gateProgress<0||next.gateProgress>1||
      next.gate==='LOCKED'&&next.gateProgress!==0||next.gate==='OPEN'&&next.gateProgress!==1)throw Error('Invalid CH5 boat gate capture')
    // Only reset can lower the gate. Defer closure until the real swept volume
    // is empty; gameplay opening always raises the door away from occupants.
    const current=gate.position.y/3.8
    if(next.gateProgress<current&&occupied(next.gateProgress)){
      pendingReset=next;s.gateProgress=current;s.gate=current===1?'OPEN':'OPERATING';syncGate();return false
    }
    pendingReset=null;Object.assign(s,next);syncGate();return true
  }
  return {cabinet,gate,gateBox,cabinetBox,targets,approaches,
    openBoatGate(){if(disposed||pendingReset||s.power!=='ON'||s.gate!=='LOCKED')return false;s.gate='OPERATING';return true},
    update(dt){if(disposed||!Number.isFinite(dt)||dt<=0||g.game.state!=='playing'||!g.player.alive||g.player.enabled===false)return
      if(pendingReset&&!occupied(pendingReset.gateProgress))reset(pendingReset)
      syncGate()
    },
    reset,capture,
    snapshot:()=>({...capture(),phase:pendingReset?'reset-pending':s.gate==='OPEN'?'open':s.gate==='OPERATING'?'opening':'closed',
      targets:Object.fromEntries(Object.entries(targets).map(([id,p])=>[id,p.toArray()])),
      approaches:Object.fromEntries(Object.entries(approaches).map(([id,p])=>[id,p.toArray()])),
      gate:{position:gate.position.toArray(),collider:{min:gateBox.min.toArray(),max:gateBox.max.toArray()}},
      repair:{position:cabinet.position.toArray(),yaw:cabinet.rotation.y,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},source:{...repairResources.source}}}),
    dispose(){if(disposed)return;disposed=true;cabinet.removeFromParent();g.physics.removeBox(cabinetBox);g.physics.build()},
  }
}
