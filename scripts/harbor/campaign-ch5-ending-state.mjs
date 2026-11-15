// Timed HUD/radio cues only. The host owns native movement, presentation and
// the physical boarding prerequisites; this model never grants campaign facts.
export const CH5_ENDING_STAGES=Object.freeze([
  {phase:'DEPARTING',seconds:1.5},
  {phase:'MONOLOGUE',seconds:2.5,channel:'hud',text:'许工……船真的还在。'},
  {phase:'MONOLOGUE',seconds:2.5,channel:'hud',text:'我终于离开紫金港了。'},
  {phase:'BROADCAST',seconds:1,channel:'radio',text:'警告。'},
  {phase:'BROADCAST',seconds:3,channel:'radio',text:'第七封锁区检测到未经授权的出港船只。'},
  {phase:'BROADCAST',seconds:2.5,channel:'radio',text:'目标正在离开指定管制区域。'},
  {phase:'BROADCAST',seconds:3.5,channel:'radio',text:'正在向中央安保网络发送海上拦截请求……'},
  {phase:'BROADCAST',seconds:1.5,channel:'radio',text:'［信号中断］'},
  {phase:'SAILING',seconds:1.5},
  {phase:'FADING',seconds:2},
].map(stage=>Object.freeze(stage.channel==='radio'?{...stage,sender:'DEEPTIDE SECURITY SYSTEM'}:stage)))
export const CH5_ENDING_SECONDS=CH5_ENDING_STAGES.reduce((sum,stage)=>sum+stage.seconds,0)

export function createChapter5Ending() {
  let started=false,finished=false,stageIndex=-1,stageElapsed=0,elapsed=0
  function cue() {
    const stage=CH5_ENDING_STAGES[stageIndex]
    if(!stage?.channel)return null
    return {channel:stage.channel,text:stage.text,seconds:stage.seconds,index:stageIndex-1,stageIndex,
      ...(stage.sender?{sender:stage.sender}:{})}
  }
  function snapshot() {
    const phase=finished?'FINISHED':started?CH5_ENDING_STAGES[stageIndex].phase:'READY'
    return {started,finished,phase,stageIndex,stageElapsed,elapsed,duration:CH5_ENDING_SECONDS,
      progress:elapsed/CH5_ENDING_SECONDS,fade:finished?1:phase==='FADING'?stageElapsed/CH5_ENDING_STAGES[stageIndex].seconds:0,cue:cue()}
  }
  function reset(){started=finished=false;stageIndex=-1;stageElapsed=elapsed=0;return snapshot()}
  function begin(){if(started)return false;started=true;stageIndex=0;return true}
  function tick(dt,active=true) {
    if(!active||!started||finished||!Number.isFinite(dt)||dt<=0)return []
    const stage=CH5_ENDING_STAGES[stageIndex],step=Math.min(dt,stage.seconds-stageElapsed)
    stageElapsed+=step;elapsed+=step
    if(stageElapsed<stage.seconds-1e-9)return []
    // Do not carry excess dt into an unread cue. Even a diagnostic long frame
    // enters at most one new stage, whose full reading time starts next tick.
    stageIndex++;stageElapsed=0
    if(stageIndex===CH5_ENDING_STAGES.length){
      finished=true;elapsed=CH5_ENDING_SECONDS;return [{type:'finished'}]
    }
    const line=cue()
    if(line)return [{type:'line',...line}]
    return CH5_ENDING_STAGES[stageIndex].phase==='SAILING'?[{type:'silence'}]:[]
  }
  return {begin,tick,reset,snapshot}
}
