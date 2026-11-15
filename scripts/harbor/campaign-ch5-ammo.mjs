import { installChapter3Ammo } from './campaign-ch3-ammo.mjs'

export const CH5_AMMO_COOLDOWN=10
export const CH5_REUSABLE_AMMO_SITES=[
  {id:'ch5-ammo-cabinet',group:null,position:{x:-34,y:0,z:13},yaw:Math.PI,
    label:'入口维修柜',code:'07-M',approach:{x:-34,y:0,z:11.4},route:{x:-33,y:0,z:11.9}},
  {id:'ch5-ammo-warehouse',group:null,position:{x:-9,y:0,z:-8.5},yaw:0,
    label:'仓库外侧',code:'07-W',approach:{x:-9,y:0,z:-6.9},route:{x:-9,y:0,z:-4.9}},
]

// M5-B supplements the entry-only supply with two independently recovering
// native crates. The existing one-use installation keeps its v1 checkpoint.
export function installChapter5Ammo(g,{equipment,narrative,onCheckpoint=()=>{}}) {
  return installChapter3Ammo(g,{equipment,narrative,getMembers:()=>[],sites:CH5_REUSABLE_AMMO_SITES,
    cooldownSeconds:CH5_AMMO_COOLDOWN,onCheckpoint:event=>onCheckpoint({...event,kind:'ch5-ammo'})})
}
