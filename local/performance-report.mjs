const percentile=(values,p)=>{
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b)
 return sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:null
}
const mean=values=>{const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((n,x)=>n+x,0)/valid.length:null}
export function summarizePerformanceFrames(frames){
 const intervals=frames.map(frame=>frame.interval),average=mean(intervals)
 const phases=[...new Set(frames.flatMap(frame=>Object.keys(frame.phases||{})))]
 return {frames:frames.length,fps:average>0?1000/average:null,
  frameMs:{median:percentile(intervals,.5),p95:percentile(intervals,.95),p99:percentile(intervals,.99)},
  over50ms:intervals.filter(n=>n>50).length,renderCpuMs:{median:percentile(frames.map(f=>f.renderMs),.5),p95:percentile(frames.map(f=>f.renderMs),.95)},
  gpuMs:{samples:frames.filter(f=>Number.isFinite(f.gpuMs)).length,median:percentile(frames.map(f=>f.gpuMs),.5),p95:percentile(frames.map(f=>f.gpuMs),.95)},
  drawCalls:mean(frames.map(f=>f.calls)),triangles:mean(frames.map(f=>f.triangles)),
  phases:Object.fromEntries(phases.map(name=>[name,{mean:mean(frames.map(f=>f.phases?.[name]||0)),p95:percentile(frames.map(f=>f.phases?.[name]||0),.95)}]))}
}

// Explicit opt-in diagnostics. Never changes quality, simulation or player input.
export function installPerformanceReport(g){
 if(document.getElementById('last-harbor-performance'))return
 const panel=document.createElement('div');panel.id='last-harbor-performance'
 panel.style.cssText='position:fixed;right:12px;top:12px;z-index:200;max-width:330px;padding:12px;background:#101820ee;color:#eee;font:13px/1.5 sans-serif;border:1px solid #777'
 const status=document.createElement('div'),start=document.createElement('button'),download=document.createElement('button')
 status.textContent='性能诊断：在卡顿场景暂停，点击记录后继续游戏。'
 start.textContent='记录 15 秒';download.textContent='下载报告';download.disabled=true
 for(const button of [start,download])button.style.cssText='margin:8px 8px 0 0;padding:6px 10px;cursor:pointer'
 panel.append(status,start,download);document.body.append(panel)
 let running=false,result=null
 start.addEventListener('click',()=>{
  if(running)return
  running=true;start.disabled=true;download.disabled=true;status.textContent='继续游戏后开始采样，不改变当前画质。'
  const frames=[],pending=[],longTasks=[],restores=[],gl=g.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const rendererInfo=gl.getExtension('WEBGL_debug_renderer_info'),began=performance.now(),startedAt=new Date().toISOString()
  const metadata={gpu:gl.getParameter(rendererInfo?rendererInfo.UNMASKED_RENDERER_WEBGL:gl.RENDERER),userAgent:navigator.userAgent,
   hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null,dpr:devicePixelRatio,
   viewport:[innerWidth,innerHeight],drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],quality:{...g.quality},resolution:g.render.stats().res,gpuTimerAvailable:!!ext}
  let phases={},sample=null,previous=null,activeMs=0,lastSecond=-1
  const playing=()=>g.game.state==='playing'&&g.player.alive&&g.player.enabled!==false&&!document.hidden
  function wrap(object,key,make){if(!object||typeof object[key]!=='function')return
   const original=object[key],wrapped=make(original);object[key]=wrapped
   restores.push(()=>{if(object[key]===wrapped)object[key]=original})
  }
  for(const name of ['game','player','weapon','enemies','level','ground','hud'])wrap(g[name],'update',original=>function(){
   if(name==='game')phases={}
   const time=performance.now();try{return original.apply(this,arguments)}finally{phases[name]=(phases[name]||0)+performance.now()-time}
  })
  wrap(g.physics.nav,'findPath',original=>function(){const time=performance.now();try{return original.apply(this,arguments)}finally{phases.navigation=(phases.navigation||0)+performance.now()-time}})
  wrap(g.render,'frame',original=>function(){
   const time=performance.now(),frame={phases:{...phases}};let query
   if(playing()&&ext&&pending.length<8&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){
    query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query)
   }
   try{return original.apply(this,arguments)}finally{
    frame.renderMs=performance.now()-time;const stats=g.render.stats()
    frame.calls=stats.calls;frame.triangles=stats.tris;frame.programs=stats.programs;frame.resolution=stats.res
    if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query,frame})}sample=frame
   }
  })
  let observer
  if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
   observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(longTasks.length<100)longTasks.push({start:entry.startTime-began,duration:entry.duration,observedState:g.game.state,hidden:document.hidden})})
   observer.observe({type:'longtask',buffered:false})
  }
  function finish(){
   running=false;for(const restore of restores.reverse())restore();observer?.disconnect();document.removeEventListener('visibilitychange',resetCadence)
   for(const {query}of pending)gl.deleteQuery(query)
   result={schema:1,startedAt,scope:'Up to 15 seconds of foreground gameplay; diagnostic sampling adds some overhead',metadata,qualityAtEnd:{...g.quality},summary:summarizePerformanceFrames(frames),
    longTasks,worstFrames:[...frames].sort((a,b)=>b.interval-a.interval).slice(0,30)}
   start.disabled=false;download.disabled=false
   status.textContent=frames.length?'记录完成。请暂停后下载报告。':'没有采到游玩帧，请继续游戏后重试。'
  }
  const resetCadence=()=>{previous=null}
  document.addEventListener('visibilitychange',resetCadence)
  function step(ts){
   if(!running)return
   for(let i=pending.length-1;i>=0;i--){const p=pending[i]
    if(!gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE))continue
    if(!gl.getParameter(ext.GPU_DISJOINT_EXT))p.frame.gpuMs=gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6
    gl.deleteQuery(p.query);pending.splice(i,1)
   }
   if(playing()&&sample){
    // The next RAF timestamp measures the cadence after the preceding render.
    if(previous!==null){const frame=previous.frame;frame.interval=ts-previous.ts;frame.at=previous.ts-began;activeMs+=frame.interval;frames.push(frame)}
    previous={ts,frame:sample}
   }else previous=null
   sample=null
   const second=Math.ceil(Math.max(0,15000-activeMs)/1000)
   if(second!==lastSecond){lastSecond=second;status.textContent=`正在记录：剩余 ${second} 秒有效游玩时间。`}
   if(activeMs>=15000||performance.now()-began>60000||frames.length>=10000)finish()
   else requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
 })
 download.addEventListener('click',()=>{
  if(!result)return
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),anchor=document.createElement('a')
  anchor.href=url;anchor.download='LastHarbor-performance.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 })
}
