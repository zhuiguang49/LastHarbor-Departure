const installed=new WeakMap()

// The native frame updates animation before rendering reflection/world/viewmodel.
// Those passes share the same scene transforms. Explicit caller updates still run.
export function installRenderMatrixCache(g){
 if(installed.has(g))return installed.get(g)
 const scene=g.scene,render=g.render,update=scene.updateMatrixWorld,frame=render.frame
 let inside=false,updated=false,disposed=false
 function updateWorld(){
  if(!inside||!updated||arguments.length){updated=true;return update.apply(this,arguments)}
 }
 function renderFrame(){
  const previous=inside,priorUpdate=updated;inside=true;updated=false
  try{return frame.apply(this,arguments)}finally{inside=previous;updated=priorUpdate}
 }
 scene.updateMatrixWorld=updateWorld;render.frame=renderFrame
 const api={dispose(){
  if(disposed)return;disposed=true
  if(scene.updateMatrixWorld===updateWorld)scene.updateMatrixWorld=update
  if(render.frame===renderFrame)render.frame=frame
  installed.delete(g)
 }}
 installed.set(g,api);return api
}
