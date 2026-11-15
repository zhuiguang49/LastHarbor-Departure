import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {nativeFixture,loadChapter2} from './campaign-ch2.check.mjs'
import {createChapter2Navigation} from './campaign-ch2-navigation.mjs'
await fs.mkdir(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/',import.meta.url),{recursive:true})
const {g,T}=await nativeFixture(),{build}=await loadChapter2()
const v=(x,z)=>new T.Vector3(x,0,z),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)

test('corridor planner keeps native exact endpoints through A/B, reverse, moving targets and the five/six connections',async()=>{
  const world=build(g);g.physics.build();const nav=createChapter2Navigation(g),report=[]
  try{
    const pairs=[['A',v(-120.5,-275.5),v(-120.5,-255.5)],['B',v(-120.5,-208),v(-120.5,-190.5)],
      ['long-target',v(-72,-289.5),v(-92.5,-185.5)],['reverse-target',v(-92.5,-185.5),v(-72,-289.5)],
      ['moved-target',v(-120.5,-244.5),v(-78.5,-192.5)],['five',v(-72,-285.5),v(-56.5,-285.5)],['six',v(-70,-190.5),v(-56.5,-190.5)]]
    for(const [id,start,goal] of pairs){
      const route=nav.findPath(start,goal);assert.ok(route,id);assert.ok(distance(route.path.at(-1),goal)<.05)
      let from=start
      for(const point of route.path){assert.ok(g.physics.nav.isWalkable(point.x,point.z));assert.ok(g.physics.nav.clearLine(from,point));from=point}
      // Long target checks stop at planning: only short A/B and connection
      // paths execute capsules. This is not an automated chapter playthrough.
      let actual=null
      if(['A','B','five','six'].includes(id)){
        const pos=start.clone(),velocity=v(0,0);let steps=0
        for(const point of route.path)while(distance(pos,point)>.035 && steps++<400){
          const before=pos.clone(),delta=point.clone().sub(pos).setY(0),speed=Math.min(3.6,delta.length()/.05)
          velocity.copy(delta).normalize().multiplyScalar(speed);velocity.y=-9.81*.05
          g.physics.moveCapsule(pos,velocity,.05,.32,1.8,true)
          assert.ok(distance(before,pos)<=speed*.05+.000001)
        }
        assert.ok(distance(pos,goal)<.05,id);actual={position:pos.toArray(),steps}
      }
      report.push({id,start:start.toArray(),finalGoal:goal.toArray(),kind:route.kind,intermediate:route.intermediate,path:route.path.map(p=>p.toArray()),actual})
    }
    assert.equal(report.find(r=>r.id==='long-target').kind,'native-corridor-graph')
    const from=v(-120.5,-275.5),to=v(-120.5,-255.5),wall=g.physics.addBox(new T.Vector3(-122,0,-267.1),new T.Vector3(-119,3,-266.9),{surface:'metal'})
    g.physics.build()
    const gateProbe=v(-120.5,-267.8),gateStart=gateProbe.clone()
    for(let i=0;i<4;i++)g.physics.moveCapsule(gateProbe,new T.Vector3(0,-9.81*.05,6.4),.05,.32,1.8,true)
    assert.ok(gateProbe.z<=-267.4,'native capsule cannot cross the closed physical door')
    const blocked=nav.findPath(from,to)
    if(blocked){let p=from;for(const next of blocked.path){assert.ok(g.physics.nav.clearLine(p,next));p=next}}
    assert.ok(!blocked || !g.physics.nav.clearLine(from,to),'closed real door cannot retain the former direct leg')
    g.physics.removeBox(wall);g.physics.build();assert.ok(nav.findPath(to,from),'reopened reverse leg')
    // Do not accept native endpoint snapping at a solid container centre.
    assert.equal(nav.findPath(v(-72,-289.5),v(-78,-281.5)),null)
    await fs.writeFile(new URL('../../artifacts/harbor/ch2-completion-2026-11-13/b1b-full-ai/navigation-local.json',import.meta.url),JSON.stringify({three:T.REVISION,stats:nav.snapshot(),report,gateCapsule:{start:gateStart.toArray(),blocked:gateProbe.toArray()},blockedDoorRoute:blocked?.path.map(p=>p.toArray())??null},null,2)+'\n')
  }finally{nav.dispose();world.dispose()}
})
