// Short authored blade/arm rush and solid contact. The original near bus owns
// volume, compression, pause and reverb; no second AudioContext or audio loop.
export function knifeSamples(kind, rate=24000) {
  const duration=kind==='swing'?.12:kind==='robot'?.105:.085, samples=new Float32Array(Math.ceil(rate*duration))
  let seed=713, low=0, high=0
  for(let i=0;i<samples.length;i++) {
    const t=i/rate, u=t/duration
    seed=(Math.imul(seed,1664525)+1013904223)>>>0; const noise=seed/2147483648-1
    low+=.06*(noise-low); high+=(kind==='swing'?.55:.28)*(noise-high)
    const envelope=kind==='swing'?Math.sin(Math.PI*u)**1.8:Math.min(1,t/.0015)*Math.exp(-t/ .021)*(1-u)
    const body=kind==='swing'?0:Math.sin(2*Math.PI*(155*t-310*t*t))*.54+Math.sin(2*Math.PI*320*t)*Math.exp(-t/.012)*.15
    samples[i]=envelope*((high-low)*(kind==='swing'?.85:.55)+body)
  }
  return samples
}
export function createKnifeSound(audio) {
  const ctx=audio?.ctx, bus=audio?.meleeBus, active=new Set(), counts={swing:0,robot:0,wall:0}
  const buffers={}
  if(ctx&&bus)for(const kind of Object.keys(counts)){const samples=knifeSamples(kind),buffer=ctx.createBuffer(1,samples.length,24000);buffer.getChannelData(0).set(samples);buffers[kind]=buffer}
  function cancel(){for(const node of active){try{node.stop()}catch{}node.disconnect()}active.clear()}
  return {
    play(kind){
      if(!ctx||!bus||ctx.state!=='running')return false
      if(active.size>=2){const oldest=active.values().next().value;oldest.stop();oldest.disconnect();active.delete(oldest)}
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers[kind];gain.gain.value=kind==='swing'?.85:1.15
      source.connect(gain);gain.connect(bus);source.onended=()=>{source.disconnect();gain.disconnect();active.delete(source)}
      active.add(source);counts[kind]++;source.start();return true
    },cancel,reset(){cancel();for(const kind of Object.keys(counts))counts[kind]=0},snapshot:()=>({...counts,active:active.size,available:!!(ctx&&bus)}),
  }
}
