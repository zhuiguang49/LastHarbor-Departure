const clamp=value=>Math.max(0,Math.min(1,value))
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t)}

// The controller owns simulation age, phase and fade. This adapter writes once
// immediately before the existing renderer, after native player/backdrop and
// infrastructure writes, without adding a camera, renderer, loop or boat model.
export function createChapter5DepartureView(g) {
  const T=g.THREE,boat=g.backdrop.boat,hull=boat.children[0],ropes=boat.children[1]
  const boatBox=g.backdrop.colliders.find(box=>box.surface==='rubber'&&Math.abs(box.min.x-30.25)<1e-6&&Math.abs(box.max.z-24.6)<1e-6)
  if(boat.name!=='boat'||!hull||!ropes||!boatBox)throw Error('CH5 departure requires the original working boat and collider')
  const originalFrame=g.render.frame,post=g.render.post
  const home={position:boat.position.clone(),quaternion:boat.quaternion.clone(),yaw:boat.rotation.y,base:g.backdrop.boatBase.clone(),
    hull:hull.rotation.clone(),ropesVisible:ropes.visible,min:boatBox.min.clone(),max:boatBox.max.clone()}
  const origin=new T.Vector3(),shoreEye=new T.Vector3(),onboardEye=new T.Vector3(),look=new T.Vector3(18.5,8,-3)
  const localEye=new T.Vector3(-1.8,2.35,.5),transform=new T.Matrix4(),rotation=new T.Matrix4()
  const inverseHome=new T.Matrix4().makeTranslation(-home.position.x,-home.position.y,-home.position.z)
  const sourceBox=new T.Box3(home.min.clone(),home.max.clone()),movedBox=new T.Box3()
  let active=false,disposed=false,age=0,phase='idle',fade=0,startYaw=boat.rotation.y,startHull=home.hull.clone()
  let savedCamera=null,savedFade=post.fade
  function apply(){
    if(!active||disposed)return
    const ramp=Math.min(age,3),distance=.25*ramp*ramp+Math.max(0,age-3)*1.5
    const turn=smooth((age-1)/5),motion=smooth(age/.8),bob=motion*(.035*Math.sin(age*1.15)+.012*Math.sin(age*2.3))
    boat.position.copy(origin);boat.position.x+=distance;boat.position.y+=bob
    boat.rotation.set(0,startYaw+Math.PI/2*turn,0)
    hull.rotation.copy(startHull);hull.rotation.x+=motion*.018*Math.sin(age*.9);hull.rotation.z+=motion*.009*Math.sin(age*1.3)
    ropes.visible=false;boat.updateMatrixWorld(true)
    // Rotate the original world AABB about its original boat anchor, then
    // translate with the very same pose. No stale collision remains at berth.
    transform.makeTranslation(boat.position.x,boat.position.y,boat.position.z)
    rotation.makeRotationY(boat.rotation.y-home.yaw)
    transform.multiply(rotation).multiply(inverseHome)
    movedBox.copy(sourceBox).applyMatrix4(transform);boatBox.min.copy(movedBox.min);boatBox.max.copy(movedBox.max)
    onboardEye.copy(localEye).applyMatrix4(boat.matrixWorld)
    g.camera.position.copy(shoreEye).lerp(onboardEye,smooth(age/1.4))
    g.camera.lookAt(look);g.camera.rotateZ(motion*.004*Math.sin(age*1.3))
    g.camera.updateMatrixWorld(true);post.fade=fade
  }
  function frame(...args){apply();return originalFrame.apply(this,args)}
  g.render.frame=frame
  function start(){
    if(disposed||active)return false
    active=true;age=0;phase='departure';fade=0;origin.copy(boat.position);shoreEye.copy(g.camera.position)
    startYaw=boat.rotation.y;startHull=hull.rotation.clone();savedFade=post.fade
    savedCamera={position:g.camera.position.clone(),quaternion:g.camera.quaternion.clone()}
    apply();return true
  }
  function update(nextAge,{phase:nextPhase='departure',fade:nextFade=0}={}){
    if(disposed||!active||g.game.state==='paused')return false
    if(!Number.isFinite(nextAge)||nextAge<0||!Number.isFinite(nextFade))throw Error('Invalid CH5 departure view sample')
    age=nextAge;phase=nextPhase;fade=clamp(nextFade);return true
  }
  function reset(){
    if(!active)return
    active=false;age=0;phase='idle';fade=0
    boat.position.copy(home.position);boat.quaternion.copy(home.quaternion);g.backdrop.boatBase.copy(home.base)
    hull.rotation.copy(home.hull);ropes.visible=home.ropesVisible;boat.updateMatrixWorld(true)
    boatBox.min.copy(home.min);boatBox.max.copy(home.max)
    if(savedCamera){g.camera.position.copy(savedCamera.position);g.camera.quaternion.copy(savedCamera.quaternion);g.camera.updateMatrixWorld(true)}
    post.fade=savedFade;savedCamera=null
  }
  return {start,update,reset,
    snapshot:()=>({active,age,phase,fade,boat:boat.position.toArray(),yaw:boat.rotation.y,hull:[hull.rotation.x,hull.rotation.y,hull.rotation.z],
      camera:g.camera.position.toArray(),look:look.toArray(),forward:g.camera.getWorldDirection(new T.Vector3()).toArray(),
      collider:{min:boatBox.min.toArray(),max:boatBox.max.toArray()},ropesVisible:ropes.visible}),
    dispose(){if(disposed)return;reset();disposed=true;if(g.render.frame===frame)g.render.frame=originalFrame},
  }
}
