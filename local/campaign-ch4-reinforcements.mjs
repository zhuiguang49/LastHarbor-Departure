import { CH4, CH4_SPAWNS } from './campaign-ch4-layout.mjs'
import { installChapter3Clearance } from './campaign-ch3-clearance.mjs'
import { CLEARANCE_CONFIG } from './campaign-ch3-clearance-config.mjs'

const quota=Object.freeze({soldier:6,hound:4})
// M4-B deployment only; keep the accepted A0/A1 map reservations unchanged.
const sites=[
  ...CH4_SPAWNS.filter(s=>s.kind==='soldier'),
  ...[-71,-68].map((x,i)=>({id:`soldier-${i+5}`,kind:'soldier',radius:.4,position:{x,y:0,z:-83}})),
  ...[[-72,-58],[-72,-54],[-66,-58],[-66,-54]].map(([x,z],i)=>({id:`hound-${i+1}`,kind:'hound',radius:.65,position:{x,y:0,z}})),
]
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)

export function installChapter4Reinforcements(g,{createVisual,narrative,canEnter=()=>true,onChange=()=>{}}) {
  const T=g.THREE,physics=g.physics,nav=physics.nav,claims=new Map(),history=[]
  const vector=p=>new T.Vector3(p.x,p.y,p.z)
  const contains=p=>p.x>=CH4.bounds.minX+.32&&p.x<=CH4.bounds.maxX-.32&&
    p.z>=CH4.bounds.minZ+.32&&p.z<=CH4.bounds.maxZ-.32&&(p.x<=-60-.32||p.z>=-4+.32)
  let elapsed=0,started=false,spawning=false,retired=false,disposed=false
  const stats={spawned:0,deferred:0,deaths:0,paths:0,pathRejects:0}
  const active=()=>!disposed&&!retired&&started&&g.game.state==='playing'&&g.player.alive&&
    g.player.enabled!==false&&!narrative?.snapshot().active
  const navigation={contains,
    findPath(from,to){
      stats.paths++
      const path=contains(from)&&contains(to)&&canEnter(to,to)&&nav.findPath(from,to)
      if(!path?.length||distance(path.at(-1),to)>.05){stats.pathRejects++;return null}
      let previous=from
      for(const point of path){
        if(!contains(point)||!nav.isWalkable(point.x,point.z)||!nav.clearLine(previous,point)||!canEnter(previous,point)){
          stats.pathRejects++;return null
        }
        previous=point
      }
      return {path:Array.from(path,p=>p.clone()),kind:'native-ch4',intermediate:[]}
    },snapshot:()=>({policy:'native 9000; exact endpoint; CH4 footprint',paths:stats.paths,pathRejects:stats.pathRejects}),dispose(){} }
  const deployments=sites.filter(s=>s.kind==='soldier').map(s=>({id:`ch4-${s.id}`,route:'central',group:null,
    position:{...s.position},yaw:Math.PI,patrol:[{...CH4.console.approach}],cover:[],territory:{...CH4.bounds}}))
  const soldiers=installChapter3Clearance(g,{createVisual,deployments,canEnter,navigation,ownerKey:'chapter-4',onChange,approachSpeed:6.4,
    narrative:{snapshot:()=>({active:!active()})}})
  const members=sites.map(site=>({id:`ch4-${site.id}`,type:site.kind,site,enemy:null,nativeId:null,
    soldier:soldiers.members.find(m=>m.id===`ch4-${site.id}`)??null,due:null,attemptAt:0,generation:0,live:false}))
  const alive=m=>m.type==='soldier'?m.soldier.target.actor.alive:
    !!(m.enemy&&m.enemy.id===m.nativeId&&m.enemy.active&&m.enemy.hp>0&&g.enemies.list.includes(m.enemy))
  const record=(type,m,data={})=>{history.push({type,id:m?.id??null,time:elapsed,...data});if(history.length>128)history.shift()}
  function safeSite(m){
    const pos=vector(m.site.position),radius=m.site.radius,height=m.type==='hound'?1.4:CLEARANCE_CONFIG.height
    if(distance(pos,g.player.pos)<14||!nav.isWalkable(pos.x,pos.z)||!canEnter(pos,pos))return null
    if(physics.boxes.some(b=>!b.bulletOnly&&pos.x+radius>b.min.x&&pos.x-radius<b.max.x&&
      pos.z+radius>b.min.z&&pos.z-radius<b.max.z&&pos.y+height>b.min.y&&pos.y+.05<b.max.y))return null
    if(members.some(peer=>peer!==m&&alive(peer)&&distance(pos,peer.type==='soldier'?peer.soldier.target.actor.pos:peer.enemy.pos)<radius+peer.site.radius+.25))return null
    if(g.enemies.list.some(e=>e.active&&e.hp>0&&distance(pos,e.pos)<radius+.9))return null
    const eye=g.player.eye??g.player.pos.clone().add(new T.Vector3(0,1.65,0)),forward=new T.Vector3()
    g.camera.getWorldDirection(forward)
    const direction=pos.clone().add(new T.Vector3(0,height*.5,0)).sub(eye),range=direction.length()
    // Include the whole spawn capsule in the camera cone and world visibility.
    const halfFov=Math.atan(Math.tan((g.camera.fov||75)*Math.PI/360)*(g.camera.aspect||1))
    const inView=direction.normalize().dot(forward)>=Math.cos(Math.min(Math.PI,halfFov+.12+Math.atan(radius/range)))
    if(inView&&[[0,height*.5,0],[0,height,0],[0,.15,0],[radius,height*.5,0],[-radius,height*.5,0],
      [0,height*.5,radius],[0,height*.5,-radius]].some(([x,y,z])=>physics.lineOfSight(eye,pos.clone().add(new T.Vector3(x,y,z)))))return null
    const path=nav.findPath(pos,g.player.pos)
    if(!path?.length||distance(path.at(-1),g.player.pos)>.05)return null
    return pos
  }
  function spawn(m,pos){
    if(m.type==='soldier'){
      if(!soldiers.respawn(m.id,{position:pos,goal:g.player.pos.clone()}))return false
    }else{
      const enemy=g.enemies.spawn('hound',pos,{state:'alert',target:g.player.pos.clone(),passive:false,
        yaw:Math.atan2(g.player.pos.x-pos.x,g.player.pos.z-pos.z)})
      if(!enemy)return false
      m.enemy=enemy;m.nativeId=enemy.id
      if(!claims.has(enemy))claims.set(enemy,new Set());claims.get(enemy).add(enemy.id)
    }
    m.due=null;m.live=true;m.generation++;stats.spawned++
    record('spawn',m,{position:pos.toArray(),generation:m.generation,hp:m.type==='soldier'?m.soldier.target.actor.hp:m.enemy.hp})
    return true
  }
  function stopSpawning(){
    const was=spawning;spawning=false
    for(const m of members)m.due=null
    return was
  }
  function clearOwned(){
    for(const bolt of g.enemies.debug.bolts)if(claims.get(bolt.owner)?.has(bolt.ownerId))bolt.on=false
    for(const [enemy,ids]of claims)if(ids.has(enemy.id)&&g.enemies.list.includes(enemy))g.enemies.debug.ctx.retire(enemy)
    claims.clear()
    for(const m of members){if(m.soldier)soldiers.retire(m.id);m.enemy=null;m.nativeId=null;m.live=false;m.due=null}
  }
  function retire(){
    if(retired)return false
    stopSpawning();retired=true;clearOwned();soldiers.update(0);return true
  }
  function reset(){
    stopSpawning();clearOwned();started=false;retired=false;elapsed=0;history.length=0
    for(const key of Object.keys(stats))stats[key]=0
    soldiers.reset()
    for(const m of members){if(m.soldier)soldiers.retire(m.id);m.attemptAt=0;m.generation=0}
  }
  function start(){
    if(started||retired||disposed)return false
    started=spawning=true
    for(const m of members){m.due=elapsed;m.attemptAt=elapsed}
    return true
  }
  function update(dt){
    if(disposed)return
    if(!active()||!Number.isFinite(dt)||dt<=0){soldiers.update(0);return}
    elapsed+=dt
    for(const m of members){
      if(m.live&&!alive(m)){
        m.live=false;stats.deaths++;record('death',m)
        if(spawning){m.due=elapsed+2;m.attemptAt=m.due}
      }
      if(!spawning||m.due===null||elapsed+1e-8<m.due||elapsed+1e-8<m.attemptAt)continue
      const pos=safeSite(m)
      if(!pos||!spawn(m,pos)){m.attemptAt=elapsed+.5;stats.deferred++}
    }
    soldiers.update(dt)
  }
  reset()
  return {members,start,update,stopSpawning,reset,retire,
    snapshot(){
      const count=predicate=>Object.fromEntries(Object.keys(quota).map(type=>[type,members.filter(m=>m.type===type&&predicate(m)).length]))
      return {started,spawning,retired,elapsed,quota:{...quota},activeByType:count(alive),queuedByType:count(m=>m.due!==null),
        reservedByType:count(m=>alive(m)||m.due!==null),stats:{...stats},soldiers:soldiers.snapshot(),
        members:members.map(m=>({id:m.id,type:m.type,alive:alive(m),due:m.due,generation:m.generation,nativeId:m.nativeId,
          hp:m.type==='soldier'?m.soldier.target.actor.hp:m.enemy?.hp??0,
          position:(m.type==='soldier'?m.soldier.target.actor.pos:m.enemy?.pos)?.toArray()??null})),history:history.map(e=>({...e}))}
    },
    dispose(){if(disposed)return;retire();disposed=true;soldiers.dispose()},
  }
}
