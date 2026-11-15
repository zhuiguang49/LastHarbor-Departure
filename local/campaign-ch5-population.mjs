import { CH5_QUOTAS, createChapter5SpawnSelector } from './campaign-ch5-spawns.mjs'

// Exactly one reservation per fixed slot, including the initial population.
// Factories own models; the population owns only identity, time and safe sites.
export function createChapter5Population(g,{active,actors,navigation,spawn,retire}) {
  let started=false,elapsed=0,seed=0,disposed=false
  const slots=Object.entries(CH5_QUOTAS).flatMap(([kind,count])=>Array.from({length:count},(_,i)=>
    ({id:`ch5-${kind}-${i+1}`,kind,actor:null,actorId:null,due:null,retryAt:0,generation:0,lastSite:null})))
  const history=[],record=(type,data)=>{history.push({type,time:elapsed,...data});if(history.length>128)history.shift()}
  const random=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}
  const selector=createChapter5SpawnSelector(g,{actors,random,navigation})
  const alive=s=>s.actor?.id===s.actorId&&!!s.actor?.alive
  function start(){if(started||disposed)return false;started=true;for(const s of slots)s.due=0;record('start',{});return true}
  function stop(){
    started=false
    for(const s of slots){s.due=null;s.retryAt=0}
  }
  function update(dt){
    if(!started||disposed||!active()||!Number.isFinite(dt)||dt<=0)return
    elapsed+=dt
    for(const s of slots){
      if(s.actor&&!alive(s)&&s.due===null){s.due=elapsed+5;s.retryAt=s.due;record('vacancy',{id:s.id,kind:s.kind,due:s.due})}
      if(alive(s)||s.due===null||elapsed+1e-9<s.due||elapsed+1e-9<s.retryAt)continue
      const point=selector.select(s.kind,s.lastSite,s.id)
      if(!point){s.retryAt=elapsed+.5;continue}
      if(s.actor){retire(s);s.actor=null}
      const actor=spawn(s,point.position,random()*Math.PI*2)
      if(!actor){s.retryAt=elapsed+.5;continue}
      s.actor=actor;s.actorId=actor.id;s.generation++;s.due=null;s.lastSite=point.site
      record('spawn',{id:s.id,kind:s.kind,generation:s.generation,actorId:actor.id,position:point.position.toArray(),
        site:point.site,playerDistance:point.playerDistance,inView:point.inView,preferred:point.preferred,hp:actor.hp})
    }
  }
  function reset(){
    for(const s of slots){if(s.actor)retire(s);Object.assign(s,{actor:null,actorId:null,due:null,retryAt:0,generation:0,lastSite:null})}
    started=false;elapsed=0;history.length=0
    seed=((Number(g.params?.seed||4207)>>>0)^Math.imul((Number(g.game.run?.retries)||0)+1,0x9e3779b9))>>>0
  }
  reset()
  return {slots,start,stop,update,reset,selector,
    capture:()=>({started,elapsed}),
    snapshot:()=>({started,elapsed,quotas:{...CH5_QUOTAS},counts:Object.fromEntries(Object.keys(CH5_QUOTAS).map(kind=>
      [kind,{alive:slots.filter(s=>s.kind===kind&&alive(s)).length,reserved:slots.filter(s=>s.kind===kind&&s.due!==null).length}])),
      slots:slots.map(s=>({id:s.id,kind:s.kind,actorId:s.actorId,alive:alive(s),hp:s.actor?.id===s.actorId?s.actor.hp:0,
        position:s.actor?.pos.toArray()??null,due:s.due,retryAt:s.retryAt,generation:s.generation,lastSite:s.lastSite})),history:history.map(e=>({...e}))}),
    dispose(){if(disposed)return;reset();disposed=true},
  }
}
