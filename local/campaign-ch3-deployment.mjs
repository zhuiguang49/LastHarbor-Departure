// M3-A2 fixed identities on the accepted A0 map. This is placement data only:
// no actor creation, replacement queues, perception or shared player location.
const p=(x,z)=>({x,y:0,z})
const site=(id,group,route,x,z,yaw,patrol,cover,territory)=>({id,group,route,position:p(x,z),yaw,
  patrol:patrol.map(([x,z])=>p(x,z)),cover:cover.map(([x,z])=>p(x,z)),territory})
const south={minX:-23,maxX:-3,minZ:-194,maxZ:-183}
const middle={minX:-22,maxX:-4,minZ:-168,maxZ:-144}
const repair={minX:-35.5,maxX:-31,minZ:-153,maxZ:-137.5}

export const CH3_CLEARANCE_DEPLOYMENTS = [
  site('c1-1','g1','central',-20,-186,Math.PI/2,[[-20,-188],[-20,-184]],[[-22,-185]],{...south}),
  site('c1-2','g1','central',-11,-189,Math.PI/2,[[-11,-191],[-11,-187]],[[-11,-192]],{...south}),
  site('c1-3','g1','central',-5,-191,Math.PI/2,[[-5,-193],[-5,-190]],[[-6,-190]],{...south}),
  site('c2-1','g2','central',-20,-165,0,[[-20,-167],[-20,-162]],[[-20,-163]],{...middle}),
  site('c2-2','g2','central',-18,-148,0,[[-18,-150],[-18,-146]],[[-18,-147]],{...middle}),
  site('c2-3','g2','central',-6,-152,0,[[-6,-154],[-6,-150]],[[-5,-153]],{...middle}),
  // The repair perimeter is on the west side of the continuous cargo screen.
  // The central route reaches it around the north end, never through the wall.
  site('c3-1','g3','central',-33.5,-150.5,0,[[-33.5,-152],[-33.5,-149]],[[-34,-149]],{...repair}),
  site('c3-2','g3','central',-33.5,-145.5,Math.PI,[[-33.5,-146.5],[-33.5,-144.5]],[[-35,-145]],{...repair}),
  site('c3-3','g3','central',-33.5,-138.5,0,[[-35,-138.5],[-32,-138.5]],[[-35,-139]],{...repair}),
  site('west-1',null,'west',-44,-176,.25,[[-45,-175],[-43,-176]],[[-44,-179]],{minX:-46,maxX:-43,minZ:-180,maxZ:-173}),
  site('west-2',null,'west',-55,-165,Math.PI/2,[[-55,-166],[-55,-164]],[[-53,-166]],{minX:-57,maxX:-52,minZ:-167,maxZ:-162}),
  site('west-3',null,'west',-36,-152,Math.PI/2,[[-37,-152],[-35,-152]],[[-36,-154]],{minX:-38,maxX:-35,minZ:-154,maxZ:-151}),
  site('west-4',null,'west',-54,-137,Math.PI/2,[[-55,-137],[-53,-137]],[[-53,-136]],{minX:-57,maxX:-52,minZ:-139,maxZ:-136}),
]

// Only the two people at the actual entrance approaches control this lock.
export const CH3_RESCUE_BLOCKERS = ['c3-2','c3-3']
