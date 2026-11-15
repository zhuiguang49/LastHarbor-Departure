import { CH2_TRAVERSAL_ROUTES } from './campaign-ch2-layout.mjs'

// A small CH2 corridor graph, not a second navmesh. Every edge and attachment
// is solved by the unchanged native nav and checked against its original goal.
export function createChapter2Navigation(g,{safeRooms=null,allowsSegment=null}={}) {
  const T=g.THREE,nav=g.physics.nav,nodes=[],edges=[],byPosition=new Map()
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
  function node(point) {
    const key=`${point.x},${point.z}`
    if(!byPosition.has(key)){byPosition.set(key,nodes.length);nodes.push(new T.Vector3(point.x,point.y,point.z));edges.push(new Set())}
    return byPosition.get(key)
  }
  function link(a,b){if(a!==b){edges[a].add(b);edges[b].add(a)}}
  for(const route of Object.values(CH2_TRAVERSAL_ROUTES)){
    let previous=null
    for(const point of route){const index=node(point);if(previous!==null)link(previous,index);previous=index}
  }
  // Physical five/six connections, plus the immediate outdoor apron. These
  // are navigation anchors only; the final sensed/tracked target stays intact.
  for(const z of [-285.5,-190.5]){
    const chain=[-60,-56.5,-48,-40].map(x=>node({x,y:0,z}))
    for(let i=1;i<chain.length;i++)link(chain[i-1],chain[i])
  }
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)
    if(distance(nodes[i],nodes[j])<=14 && nav.isWalkable(nodes[i].x,nodes[i].z) && nav.isWalkable(nodes[j].x,nodes[j].z) && nav.clearLine(nodes[i],nodes[j]))link(i,j)
  const cache=new Map(),stats={queries:0,nativeQueries:0,graphPlans:0,failures:0}
  const legProbe=new T.Vector3()
  function legValid(from,to) {
    if(!nav.clearLine(from,to) || safeRooms&&!safeRooms.allowsEnemySegment(from,to) || allowsSegment&&!allowsSegment(from,to))return false
    // Native smoothing rasterizes a chord; it can miss a cell touched between
    // arbitrary spawn coordinates and cell centres. Check the actual chord too.
    const count=Math.ceil(distance(from,to)/.1)
    for(let i=0;i<=count;i++){
      const alpha=count?i/count:0,x=from.x+(to.x-from.x)*alpha,z=from.z+(to.z-from.z)*alpha
      legProbe.set(x,from.y+(to.y-from.y)*alpha,z)
      if(!nav.isWalkable(x,z)||!nav.clearLine(legProbe,to))return false
    }
    return true
  }
  function valid(from,to,path) {
    if(!path?.length || distance(path.at(-1),to)>.05 || !nav.isWalkable(from.x,from.z) || !nav.isWalkable(to.x,to.z))return false
    for(const point of path){if(!nav.isWalkable(point.x,point.z)||!legValid(from,point))return false;from=point}
    return true
  }
  function raw(from,to) {
    if(!nav.isWalkable(from.x,from.z)||!nav.isWalkable(to.x,to.z))return null
    stats.nativeQueries++
    const path=nav.findPath(from,to)
    if(!path?.length || distance(path.at(-1),to)>.05)return null
    return Array.from(path,p=>p.clone())
  }
  function local(from,to) {
    const native=raw(from,to)
    if(!native)return null
    const result=[];let previous=from
    for(const point of native){
      if(legValid(previous,point))result.push(point)
      else {
        // Bounded corner repair: two real orthogonal local endpoints, each
        // queried through native nav. No custom grid search or snapped goals.
        let repair=null
        for(const elbow of [new T.Vector3(previous.x,point.y,point.z),new T.Vector3(point.x,point.y,previous.z)]){
          const first=raw(previous,elbow),second=raw(elbow,point)
          if(valid(previous,elbow,first)&&valid(elbow,point,second)){repair=[...first,...second];break}
        }
        if(!repair)return null
        result.push(...repair)
      }
      previous=point
    }
    return valid(from,to,result)?result:null
  }
  function edge(a,b) {
    const key=`${a}:${b}`,cached=cache.get(key)
    if(cached && valid(nodes[a],nodes[b],cached))return cached
    const path=local(nodes[a],nodes[b])
    if(path)cache.set(key,path);else cache.delete(key)
    return path
  }
  function attachments(point,reverse=false) {
    const candidates=nodes.map((p,i)=>({i,d:distance(point,p)})).filter(c=>c.d<=24).sort((a,b)=>a.d-b.d)
    const result=[]
    for(const {i} of candidates){const path=reverse?local(nodes[i],point):local(point,nodes[i]);if(path)result.push({i,path});if(result.length===4)break}
    return result
  }
  function findPath(from,to) {
    stats.queries++
    if(safeRooms?.contains(to)){stats.failures++;return null}
    if(distance(from,to)<=24){const direct=local(from,to);if(direct)return {path:direct,kind:'native-local',intermediate:[]}}
    stats.graphPlans++
    const starts=attachments(from),ends=attachments(to,true),cost=new Map(),previous=new Map(),open=new Set()
    const length=(start,path)=>{let n=0;for(const p of path){n+=distance(start,p);start=p}return n}
    for(const start of starts){cost.set(start.i,length(from,start.path));open.add(start.i)}
    const finished=new Set()
    while(open.size){
      let a=null
      for(const i of open)if(a===null||cost.get(i)<cost.get(a))a=i
      open.delete(a);finished.add(a)
      for(const b of edges[a]){
        if(finished.has(b))continue
        const path=edge(a,b);if(!path)continue
        const next=cost.get(a)+length(nodes[a],path)
        if(next<(cost.get(b)??Infinity)){cost.set(b,next);previous.set(b,{a,path});open.add(b)}
      }
    }
    const end=ends.filter(e=>cost.has(e.i)).sort((a,b)=>cost.get(a.i)+length(nodes[a.i],a.path)-cost.get(b.i)-length(nodes[b.i],b.path))[0]
    if(!end){stats.failures++;return null}
    const legs=[],indices=[end.i];let i=end.i
    while(previous.has(i)){const leg=previous.get(i);legs.unshift(leg.path);i=leg.a;indices.unshift(i)}
    const start=starts.find(s=>s.i===i),path=[...start.path,...legs.flat(),...end.path]
    if(!valid(from,to,path)){stats.failures++;return null}
    return {path,kind:'native-corridor-graph',intermediate:indices.map(i=>nodes[i].toArray())}
  }
  return {findPath,snapshot:()=>({...stats,nodes:nodes.length,policy:'native 9000; exact endpoints; live edge/leg validation'}),dispose(){cache.clear()}}
}
