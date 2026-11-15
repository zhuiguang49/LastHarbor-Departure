// Fixed M4-A1 ordinary patrols; the accepted map and future reinforcement sites
// remain owned by campaign-ch4-layout.mjs. Positions use native ground metres.
export const CH4_INFECTED_SECTION=Object.freeze({
  id:'ch4-blockade',bounds:Object.freeze({minX:-80,maxX:-60,minZ:-120,maxZ:-7}),
})
export const CH4_INFECTED_SPAWNS=Object.freeze([
  [-72,-91,90],      // Behind the first transverse container.
  [-65.5,-80,270],   // Eastern cargo / damaged pickup pocket.
  [-73.8,-66,0],     // Western opening beside the second transverse container.
  [-66.3,-49,270],   // Approach to the central diagonal container.
  [-73.5,-28,90],    // Last cargo bay before the gate staging area.
].map(([x,z,degrees],index)=>Object.freeze({
  id:`ch4-infected-${index+1}`,sectionId:CH4_INFECTED_SECTION.id,
  position:Object.freeze({x,y:0,z}),initialYaw:degrees*Math.PI/180,
  mode:'ordinary',patrol:true,
})))
