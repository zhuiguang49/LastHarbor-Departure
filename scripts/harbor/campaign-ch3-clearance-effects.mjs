// Borrow the original mixer/context, with owned, cancellable spatial voices.
// No scope glint, laser, timer callback, renderer or second AudioContext.
export function createClearanceEffects(g) {
  const ctx=g.audio?.ctx,bus=g.audio?.meleeBus,voices=new Set()
  let buffer=null,shots=0
  if(ctx&&bus){
    const rate=24000;buffer=ctx.createBuffer(1,rate*.18,rate)
    const data=buffer.getChannelData(0);let seed=1703,low=0
    for(let i=0;i<data.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0
      const t=i/rate,noise=seed/2147483648-1;low+=.16*(noise-low)
      data[i]=Math.min(1,t/.0008)*Math.exp(-t/.035)*(noise*.65+low*.6+Math.sin(t*2*Math.PI*110)*.3)
    }
  }
  function release(voice,stop=false){
    if(!voices.delete(voice))return
    voice.source.onended=null
    if(stop)try{voice.source.stop()}catch{}
    voice.source.disconnect();voice.gain.disconnect();voice.pan.disconnect()
  }
  return {
    fire(id,origin){
      shots++
      if(!buffer||ctx.state!=='running')return
      const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createPanner()
      source.buffer=buffer;gain.gain.value=1.8
      pan.panningModel='equalpower';pan.distanceModel='inverse';pan.refDistance=8;pan.maxDistance=70;pan.rolloffFactor=.8
      pan.positionX.value=origin.x;pan.positionY.value=origin.y;pan.positionZ.value=origin.z
      source.connect(gain);gain.connect(pan);pan.connect(bus)
      const voice={id,source,gain,pan};voices.add(voice);source.onended=()=>release(voice);source.start()
    },
    cancel(id){for(const voice of [...voices])if(id===undefined||voice.id===id)release(voice,true)},
    snapshot:()=>({shots,voices:voices.size,audioAvailable:!!buffer}),
    dispose(){this.cancel();buffer=null},
  }
}
