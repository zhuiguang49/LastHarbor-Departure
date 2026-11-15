import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import { CAMPAIGN_PLAYER_BRIDGE, captureCampaignPlayer, validateCampaignPlayer, restoreCampaignPlayer } from './campaign-player-state.mjs'

const html=await fs.readFile(new URL('../../几猫国产3A大作_V1-fable5.2.html',import.meta.url),'utf8')
const source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
const body=parse(source).program.body[0].expression.callee.body.body
const boundary=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='gM'))
const playerNode=body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='x_'),at=playerNode.body.body.at(-1).start
const prefix=source.slice(body[0].start,at)+CAMPAIGN_PLAYER_BRIDGE+source.slice(at,boundary.start)
const native=vm.runInNewContext(`(()=>{${prefix};return {T:lt,player:x_,physics:d3}})()`,{console,performance,AbortController},{timeout:15000})
const json=value=>JSON.parse(JSON.stringify(value))
function fixture() {
  const T=native.T,g={THREE:T,camera:new T.PerspectiveCamera(),events:{on(){},emit(){}},
    input:{look:{dx:0,dy:0},move:{x:0,y:0},sprint:false,crouch:false,fire:false,ads:false,pressed:()=>false},weapon:{ads:0}}
  g.physics=native.physics(g)
  g.physics.addBox(new T.Vector3(-10,-1,-10),new T.Vector3(10,0,10),{surface:'concrete'});g.physics.build()
  g.player=native.player(g);g.player.reset({pos:new T.Vector3(0,0,0),yaw:.6})
  return g
}

test('native player checkpoint restores crouch, momentum, rescue point and HP without resetting regeneration delay',()=>{
  const g=fixture(),p=g.player
  p.damage(37);g.input.crouch=true;p.update(.1)
  p.vel.set(1.2,0,-2.1);p.lastSafe.set(-2,0,3);p.pitch=.4
  const saved=json(captureCampaignPlayer(p))
  p.reset();p.damage(80);restoreCampaignPlayer(g,saved)
  assert.deepEqual(json(captureCampaignPlayer(p)),saved)
  assert.equal(p.invulnerable,false);assert.equal(p.enabled,true)
  assert.ok(p.eye.y<1.5,'native crouched camera is restored before the next tick')
  p.update(.1);assert.equal(p.health,63,'restore must not set native damage age to 99')
  g.input.crouch=false
  for(let i=0;i<100;i++)p.update(.1)
  assert.ok(p.health>63,'original delayed regeneration remains active')
})

test('airborne native motion round trips and malformed player data is rejected before mutation',()=>{
  const g=fixture(),p=g.player
  p.pos.set(0,3,0);p.vel.set(2,-4,-1);p.onGround=false;p.update(.1)
  const saved=json(captureCampaignPlayer(p));assert.ok(saved.motion.airTime>0)
  restoreCampaignPlayer(g,saved);assert.deepEqual(json(captureCampaignPlayer(p)),saved)
  for(const mutate of [s=>s.velocity.pop(),s=>s.health=0,s=>s.motion.damageAge=NaN,s=>s.onGround='false']) {
    const bad=structuredClone(saved);mutate(bad)
    assert.throws(()=>restoreCampaignPlayer(g,bad),/Invalid campaign player checkpoint/)
    assert.deepEqual(json(captureCampaignPlayer(p)),saved)
  }
  const copy=validateCampaignPlayer(saved);copy.lastSafe[0]=999;assert.notEqual(saved.lastSafe[0],999)
})

test('shot capsule reads the actual native movement radius and height through crouch and blocked standing',()=>{
  const g=fixture(),p=g.player,move=g.physics.moveCapsule
  let used
  g.physics.moveCapsule=(position,velocity,dt,radius,height,...rest)=>{
    used={radius,height};return move(position,velocity,dt,radius,height,...rest)
  }
  function check(){
    p.update(.016)
    const capsule=p.captureCampaignCollider()
    assert.equal(capsule.radius,used.radius);assert.equal(capsule.height,used.height)
    assert.deepEqual(json(capsule.position),json(p.pos));assert.notEqual(capsule.position,p.pos)
    return capsule.height
  }
  const standing=check();g.input.crouch=true;const crouched=check();assert.ok(crouched<standing)
  g.physics.addBox(new g.THREE.Vector3(-1,1.3,-1),new g.THREE.Vector3(1,2,1),{surface:'metal'});g.physics.build()
  g.input.crouch=false;assert.equal(check(),crouched,'release under a ceiling retains the real crouched capsule')
  p.pos.x=3;assert.equal(check(),standing,'native automatic standing updates the firing collider')
})
