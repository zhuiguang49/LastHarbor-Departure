import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nativeFixture } from './campaign-ch2.check.mjs'
import { nativeChapter3Fixture } from './campaign-ch3.check.mjs'
import { createSniperPerception } from './campaign-ch3-sniper-perception.mjs'
import { SNIPER_CONFIG } from './campaign-ch3-sniper-config.mjs'

test('fixed FOV/range rejects rear targets; real head exposure and crouched cover use world rays',async()=>{
  const {g,T}=await nativeFixture(),position=new T.Vector3(0,0,-10)
  let height=1.8
  g.player={alive:true,enabled:true,captureCampaignCollider:()=>({position:position.clone(),radius:.32,height})}
  const sight=createSniperPerception(g,{getEye:()=>new T.Vector3(0,1.7,0),getMuzzle:()=>new T.Vector3(0,1.5,0)},
    {...SNIPER_CONFIG,yaw:0})
  assert.ok(sight.getVisibleTarget())
  position.z=10;assert.equal(sight.getVisibleTarget(),null)
  position.set(81,0,-81);assert.equal(sight.getVisibleTarget(),null)
  position.set(0,0,-10)
  const low=g.physics.addBox([-2,0,-9.5],[2,1.3,-9],{surface:'metal'})
  assert.ok(sight.getVisibleTarget(),'upper torso remains visible above low cover')
  height=1.15;assert.equal(sight.getVisibleTarget(),null,'all crouched samples are behind real metal')
  height=1.8;low.max.y=2;assert.equal(sight.getVisibleTarget(),null)
  g.physics.removeBox(low)
  const side=g.physics.addBox([-.05,0,-9.5],[2,2,-9],{surface:'metal'})
  assert.ok(sight.getVisibleTarget(),'one exposed shoulder is sufficient even if centre is hidden')
  g.physics.removeBox(side)
  g.player.enabled=false;assert.equal(sight.getVisibleTarget(),null)
  g.player.enabled=true;g.player.alive=false;assert.equal(sight.getVisibleTarget(),null)
})

test('accepted M3-A0 main lane is observable while its west cargo detour occludes the tower',async()=>{
  const f=await nativeChapter3Fixture(),{g,T}=f,position=new T.Vector3()
  g.player={alive:true,enabled:true,captureCampaignCollider:()=>({position:position.clone(),radius:.32,height:1.8})}
  const sight=createSniperPerception(g,{getEye:()=>new T.Vector3(8,6.7,-154),getMuzzle:()=>new T.Vector3(7.5,6.55,-154.6)})
  try{
    for(const [x,z]of [[-20,-186],[1,-180],[1,-170],[-20,-165]]){
      position.set(x,0,z);assert.ok(sight.getVisibleTarget(),`main lane ${x},${z}`)
    }
    for(const [x,z]of [[-56,-176],[-56,-163],[-33.5,-163]]){
      position.set(x,0,z);assert.equal(sight.getVisibleTarget(),null,`west cargo cover ${x},${z}`)
    }
    position.set(15,0,-140);assert.equal(sight.getVisibleTarget(),null,'no rotation into rear sector')
  }finally{f.dispose()}
})
