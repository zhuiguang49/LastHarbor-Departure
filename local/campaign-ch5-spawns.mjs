// Audited coordinates in the unchanged original Berth 7. Runtime validation
// also sees live shutters, aftermath props and the other owned slots.
export const CH5_QUOTAS=Object.freeze({infected:7,soldier:5,hound:3,gull:3})
export const CH5_BOUNDS=Object.freeze({minX:-40,maxX:29,minZ:-29,maxZ:29})
export const CH5_GROUND_SITES=Object.freeze([
  [-18,-26],[18,-26],[-36,-20],[18,-20],[-30,-14],[18,-14],
  [-36,-8],[-30,-8],[-24,-8],[6,-8],[12,-8],[24,-8],
  [-30,-2],[-24,-2],[-18,-2],[0,-2],[6,-2],[18,-2],
  [-30,4],[-24,4],[18,4],[-6,10],[18,10],
  [-30,16],[-24,16],[-18,16],[-12,16],[-6,16],[6,16],[12,16],[18,16],[-30,22],[24,22],
].map(([x,z],i)=>Object.freeze({id:`ground-${i}`,x,y:0,z})))
// The original four roam the whole berth. Each extra slot keeps its assigned
// coast-side spawn area on replacement, then uses the normal unrestricted AI.
export const CH5_INFECTED_AREAS=Object.freeze({
  'ch5-infected-5':Object.freeze(CH5_GROUND_SITES.filter(s=>s.x>=18&&s.z>=10)),
  'ch5-infected-6':Object.freeze(CH5_GROUND_SITES.filter(s=>s.x<=-24&&s.z>=16)),
  'ch5-infected-7':Object.freeze(CH5_GROUND_SITES.filter(s=>s.x>=-18&&s.x<=12&&s.z>=16)),
})
export const CH5_AIR_SITES=Object.freeze([
  [18,7,-26],[18,7,-20],[18,7,-14],[-36,5,-8],[24,7,-8],
  [-24,5,-2],[-18,5,-2],[12,7,-2],[24,5,-2],[-12,5,4],
  [18,5,4],[-6,5,10],[18,5,10],[-30,5,16],[-18,5,16],[-6,5,16],[12,5,16],
].map(([x,y,z],i)=>Object.freeze({id:`air-${i}`,x,y,z})))
export const inChapter5=p=>p.x>=CH5_BOUNDS.minX&&p.x<=CH5_BOUNDS.maxX&&p.z>=CH5_BOUNDS.minZ&&p.z<=CH5_BOUNDS.maxZ

export function createChapter5Navigation(g) {
  const nav=g.physics.nav,stats={queries:0,rejected:0}
  function findPath(from,to){
    stats.queries++
    const reject=()=>{stats.rejected++;return null}
    if(!inChapter5(from)||!inChapter5(to)||!nav.isWalkable(from.x,from.z)||!nav.isWalkable(to.x,to.z))return reject()
    const path=nav.findPath(from,to)
    if(!path?.length||Math.hypot(path.at(-1).x-to.x,path.at(-1).z-to.z)>.05)return reject()
    let previous=from
    for(const point of path){
      if(!inChapter5(point)||!nav.isWalkable(point.x,point.z)||!nav.clearLine(previous,point))return reject()
      previous=point
    }
    return {path:Array.from(path,p=>p.clone()),kind:'native-berth7'}
  }
  return {findPath,contains:inChapter5,snapshot:()=>({...stats}),dispose(){}}
}

export function createChapter5SpawnSelector(g,{actors,random,navigation}) {
  const T=g.THREE,hub=new T.Vector3(-3.5,0,-9.5),airHub=new T.Vector3(8,7,12)
  const vector=p=>new T.Vector3(p.x,p.y,p.z)
  function volume(point,radius,height){
    return !g.physics.boxes.some(b=>!b.bulletOnly&&point.x+radius>b.min.x&&point.x-radius<b.max.x&&
      point.z+radius>b.min.z&&point.z-radius<b.max.z&&point.y+height>b.min.y+.025&&point.y<b.max.y-.025)
  }
  function flight(from,to){
    const distance=from.distanceTo(to),steps=Math.max(1,Math.ceil(distance/.4)),p=from.clone()
    for(let i=0;i<=steps;i++)if(!volume(p.copy(from).lerp(to,i/steps).add(new T.Vector3(0,-.5,0)),.65,1))return false
    return true
  }
  function visible(point){
    const eye=g.player.eye,delta=point.clone().sub(eye),forward=g.camera?.getWorldDirection?.(new T.Vector3())??g.player.forward
    const fov=(g.camera?.fov??75)*Math.PI/180,aspect=g.camera?.aspect??16/9
    const half=Math.atan(Math.tan(fov/2)*Math.max(1,aspect))
    return delta.normalize().dot(forward)>Math.cos(half+.12)&&g.physics.lineOfSight(eye,point)
  }
  function validate(kind,site){
    const point=vector(site),air=kind==='gull',radius=kind==='hound'?.65:air?.65:.4,height=air?1:kind==='hound'?1.4:1.8
    const distance=Math.hypot(point.x-g.player.pos.x,point.z-g.player.pos.z),base=point.clone();if(air)base.y-=.5
    if(!(distance>5)||!inChapter5(point)||!g.physics.nav.isWalkable(point.x,point.z)||!volume(base,radius,height))return null
    for(const {collider:c}of actors())if(base.y<c.position.y+c.height+.1&&base.y+height+.1>c.position.y&&
      Math.hypot(point.x-c.position.x,point.z-c.position.z)<radius+c.radius+.2)return null
    if(air?!flight(point,airHub):!navigation.findPath(point,hub))return null
    const inView=visible(point.clone().add(new T.Vector3(0,air?0:1.3,0)))
    return {site:site.id,position:point,playerDistance:distance,inView,preferred:distance>8&&!inView}
  }
  function select(kind,lastSite,slotId){
    const sites=[...(kind==='infected'&&CH5_INFECTED_AREAS[slotId]|| (kind==='gull'?CH5_AIR_SITES:CH5_GROUND_SITES))]
    for(let i=sites.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[sites[i],sites[j]]=[sites[j],sites[i]]}
    // Keep the draw random, but avoid immediately reusing a slot's last site.
    sites.sort((a,b)=>(a.id===lastSite?1:0)-(b.id===lastSite?1:0))
    let fallback=null
    for(const site of sites){const valid=validate(kind,site);if(valid?.preferred)return valid;if(valid&&!fallback)fallback=valid}
    return fallback
  }
  return {select,validate,volume,flight}
}
