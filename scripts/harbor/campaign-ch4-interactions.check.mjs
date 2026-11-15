import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { installChapter4Interactions } from './campaign-ch4-interactions.mjs'
import { CH4 } from './campaign-ch4-layout.mjs'

test('A0 console inspections need facing, distance, LOS and a fresh E press; never open the gate',async()=>{
  const {T,g}=await nativeFixture(),messages=[]
  let pressed=false,down=false
  Object.assign(g,{game:{state:'playing'},time:{frame:0},input:{pressed:()=>pressed,down:()=>down},
    player:{alive:true,enabled:true,pos:new T.Vector3(),eye:new T.Vector3(),forward:new T.Vector3(0,0,-1)},
    hud:{setPrompt(text){this.prompt=text},message:text=>messages.push(text)}})
  const a=CH4.console.approach
  g.player.pos.set(a.x,0,a.z);g.player.eye.copy(g.player.pos).y=1.68
  const target=CH4.console.target,forward=new T.Vector3(target.x-a.x,0,target.z-a.z).normalize()
  g.player.forward.copy(forward)
  const inspection=installChapter4Interactions(g,CH4),tick=()=>{g.time.frame++;inspection.interact()}
  tick();assert.match(g.hud.prompt,/检查控制台/)
  pressed=down=true;tick();assert.equal(inspection.snapshot().consoleInspections,1)
  tick();assert.equal(inspection.snapshot().consoleInspections,1)
  pressed=down=false;tick();g.player.forward.copy(forward).negate();pressed=down=true;tick()
  assert.equal(inspection.snapshot().consoleInspections,1)
  pressed=down=false;tick();g.player.forward.copy(forward)
  const midpoint=new T.Vector3(target.x,0,target.z).add(g.player.pos).multiplyScalar(.5)
  const wall=g.physics.addBox([midpoint.x-.2,0,midpoint.z-.2],[midpoint.x+.2,3,midpoint.z+.2]);g.physics.build()
  pressed=down=true;tick();assert.equal(g.hud.prompt,null);assert.equal(inspection.snapshot().consoleInspections,1)
  g.physics.removeBox(wall);g.physics.build();pressed=down=false;tick()
  g.player.pos.x+=10;g.player.eye.x+=10;pressed=down=true;tick();assert.equal(g.hud.prompt,null)
  assert.equal(messages.length,1);assert.equal(inspection.snapshot().gateClosed,true)
  inspection.reset();assert.equal(inspection.snapshot().consoleInspections,0)
})
