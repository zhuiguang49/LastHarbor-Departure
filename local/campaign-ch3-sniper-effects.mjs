// Single-shot cues through the original scene and near audio bus. No laser,
// screen overlay, timer callback or second AudioContext/render loop.
import { SNIPER_CONFIG } from './campaign-ch3-sniper-config.mjs'

export function createSniperEffects(g, visual) {
  const T=g.THREE,ctx=g.audio?.ctx,bus=g.audio?.meleeBus,voices=new Set(),buffers={}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64
  const c=canvas.getContext('2d'),gradient=c.createRadialGradient(32,32,0,32,32,32)
  gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.12,'rgba(230,245,255,.95)')
  gradient.addColorStop(.32,'rgba(200,225,255,.25)');gradient.addColorStop(1,'rgba(200,225,255,0)')
  c.fillStyle=gradient;c.fillRect(0,0,64,64)
  const texture=new T.CanvasTexture(canvas),material=new T.SpriteMaterial({map:texture,transparent:true,
    blending:T.AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false})
  const glint=new T.Sprite(material),flash=new T.Sprite(material.clone());glint.name='sniper-scope-glint';flash.name='sniper-muzzle-flash'
  flash.material.color.set(0xffdc9a);glint.visible=flash.visible=false;g.scene.add(glint,flash)
  let glintTime=0,flashTime=0,aimCues=0,shots=0
  if(ctx&&bus)for(const kind of ['aim','fire']) {
    const rate=24000,duration=kind==='aim'?.13:.23,buffer=ctx.createBuffer(1,Math.ceil(rate*duration),rate),data=buffer.getChannelData(0)
    let seed=803,low=0
    for(let i=0;i<data.length;i++){
      const t=i/rate,u=t/duration;seed=(Math.imul(seed,1664525)+1013904223)>>>0
      const noise=seed/2147483648-1;low+=.14*(noise-low)
      data[i]=kind==='aim'?Math.sin(Math.PI*u)**1.3*(Math.sin(2*Math.PI*(1900*t+1900*t*t))*.5+Math.sin(2*Math.PI*2850*t)*.12):
        Math.min(1,t/.0007)*Math.exp(-t/.042)*(noise*.7+low*.65+Math.sin(2*Math.PI*95*t)*.35)
    }
    buffers[kind]=buffer
  }
  function play(kind,position){
    if(!ctx||!bus||ctx.state!=='running')return
    const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createPanner()
    source.buffer=buffers[kind];gain.gain.value=kind==='aim'?.8:2
    pan.panningModel='equalpower';pan.distanceModel='inverse';pan.refDistance=20;pan.maxDistance=100;pan.rolloffFactor=.65
    pan.positionX.value=position.x;pan.positionY.value=position.y;pan.positionZ.value=position.z
    source.connect(gain);gain.connect(pan);pan.connect(bus)
    const voice={source,release(){source.disconnect();gain.disconnect();pan.disconnect();voices.delete(voice)}}
    voices.add(voice);source.onended=()=>voice.release();source.start()
  }
  function cancel(){
    glintTime=flashTime=0;glint.visible=flash.visible=false
    for(const voice of [...voices]){try{voice.source.stop()}catch{}voice.release()}
  }
  function update(dt){
    glintTime=Math.max(0,glintTime-dt);flashTime=Math.max(0,flashTime-dt)
    glint.visible=glintTime>0;flash.visible=flashTime>0
    if(glint.visible){visual.scope.getWorldPosition(glint.position);glint.scale.setScalar(.75);material.opacity=Math.min(1,glintTime/.045)}
    if(flash.visible){flash.position.copy(visual.getMuzzle());flash.scale.setScalar(.45)}
  }
  return {
    aim(){aimCues++;glintTime=SNIPER_CONFIG.scopeGlintSeconds;play('aim',visual.getMuzzle());update(0)},
    fire(result){
      shots++;glintTime=0;flashTime=SNIPER_CONFIG.muzzleFlashSeconds;play('fire',result.origin)
      if(result.worldHit && (!result.hit || result.worldHit.dist<result.playerDistance)){
        const hit=result.worldHit
        g.events.emit('impact',{point:hit.point,normal:hit.normal,surface:hit.surface||'metal',dir:result.direction,weapon:'sniper'})
      }
      update(0)
    },update,cancel,
    snapshot:()=>({aimCues,shots,voices:voices.size,glintVisible:glint.visible,flashVisible:flash.visible,depthTest:material.depthTest,audioAvailable:!!(ctx&&bus)}),
    dispose(){cancel();glint.removeFromParent();flash.removeFromParent();material.dispose();flash.material.dispose();texture.dispose()},
  }
}
