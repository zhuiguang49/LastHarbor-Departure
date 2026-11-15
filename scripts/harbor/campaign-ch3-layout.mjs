// M3-A0 environment contract. Feet use native metres; the integration layer
// retains the M1 perimeter, ground and chapter seams. No actors or story flags.
const point = (x,z,y=0) => ({x,y,z})
export const CH3 = {
  stage:'M3-A0',sectorId:'berth-6',bounds:{minX:-60,maxX:30,minZ:-205,maxZ:-100},
  links:[
    {id:'yard-to-six',x:-60,minZ:-196,maxZ:-184},
    {id:'six-to-control',x:-60,minZ:-116,maxZ:-104},
  ],
  tower:point(8,-154,5.2),towerEye:point(8,-154,6.85),
  observation:{position:point(12,-154,4.6),standing:point(12,-153,5.4)},
  safeHouse:{position:point(-43,-142),bounds:{minX:-49.095,maxX:-36.905,minZ:-143.219,maxZ:-140.781},
    floor:.172,ceiling:2.5,entrance:[point(-33.5,-142),point(-38,-142,.172),point(-43,-142,.172)],
    survivor:point(-45,-142,.172),visitor:point(-40,-142,.172)},
}

export const CH3_CONTAINERS = [
  // Continuous double-height visual/collision screen. The two real routes join
  // around its ends, rather than leaking between nominally touching boxes.
  ...Array.from({length:6},(_,i)=>(i<2?[0]:[0,2.59]).map(y=>({id:`west-screen-${i}-${y}`,x:-28,y,z:-185.5+i*12.19,yaw:Math.PI/2,variant:2}))).flat(),
  // Alternate the opening of the western lane. Rows close against the native
  // perimeter or the screen; the open side remains several capsule widths.
  ...[[-53.9,-182],[-41.71,-182],[-43.9,-169],[-31.71,-169],[-53.9,-156],[-41.71,-156],[-43.9,-133],[-31.71,-133],[-53.9,-120],[-41.71,-120]].flatMap(([x,z],i)=>
    (i<2?[0]:[0,2.59]).map(y=>({id:`west-chicane-${i}-${y}`,x,y,z,yaw:0,variant:2}))),
  // Main apron: alternating full industrial cover, not another dark box maze.
  ...[[-24,-181],[-15,-156],[-24,-127]].map(([x,z],i)=>({id:`main-cover-${i}`,x,y:0,z,yaw:Math.PI/2,variant:i%2})),
  ...[[-20.71,-176],[-8.52,-176],[.095,-159],[12.285,-159],[23.5,-159],[-20.71,-132],[-8.52,-132]].map(([x,z],i)=>({id:`main-chicane-${i}`,x,y:0,z,yaw:0,variant:1})),
  ...[-199,-177,-146,-115].map((z,i)=>({id:`quay-stock-${i}`,x:20,y:0,z,yaw:0,variant:1})),
]

// Full native cargo displaced across the apron. Side-resting boxes rotate about
// their long axis and are grounded from the transformed mesh, never floated.
export const CH3_DISPLACED_CARGO = [
  {id:'entry-skew',kind:'container20',x:-43,z:-186.7,yaw:.26},
  {id:'south-skew',kind:'container20',x:-4,z:-195,yaw:-.34},
  {id:'south-toppled',kind:'container40',x:14,z:-187,yaw:.3,pitch:Math.PI/2},
  {id:'loading-skew',kind:'container20',x:8,z:-169,yaw:-.4},
  {id:'loading-toppled',kind:'container20',x:22,z:-167,yaw:.25,pitch:-Math.PI/2},
  {id:'west-skew',kind:'container20',x:-44,z:-148,yaw:-.28},
  {id:'north-toppled',kind:'container40',x:17,z:-137,yaw:-.3,pitch:Math.PI/2},
  {id:'exit-skew',kind:'container20',x:7,z:-119,yaw:.38},
]

export const CH3_VEHICLES = [
  {id:'south-pickup',kind:'pickup',x:-3.5,z:-184.8,yaw:Math.PI/2},
  {id:'north-pickup',kind:'pickup',x:-4,z:-115.5,yaw:0},
  {id:'south-loader',kind:'forklift',x:7,z:-192,yaw:Math.PI/2},
  {id:'middle-loader',kind:'forklift',x:15,z:-172,yaw:Math.PI},
  {id:'north-loader',kind:'forklift',x:10,z:-134,yaw:0},
]

export const CH3_ROUTES = {
  main:[point(-56,-190),point(-56,-195.5),point(-20,-195.5),point(-20,-186),point(1,-180),point(1,-170),
    point(-20,-165),point(-20,-143),point(1,-137),point(1,-126),point(-20,-116),point(-20,-113),point(-56,-113),point(-56,-110)],
  west:[point(-56,-190),point(-33,-190),point(-33,-176),point(-56,-176),point(-56,-163),
    point(-33.5,-163),point(-33.5,-138.5),point(-56,-138.5),point(-56,-127),point(-33.5,-127),
    point(-33.5,-113),point(-56,-113),point(-56,-110)],
  safeHouse:CH3.safeHouse.entrance,
  observation:[point(8,-154,5.2),point(9.9,-154,5.2),point(9.9,-153,5.2),point(10.3,-153,5.4),point(12,-153,5.4)],
  tower:[point(3,-154),point(6.3,-154,2.6),point(8,-154,2.6),point(12.9,-154,2.6),point(12.9,-151.2,2.6),point(12.5,-151.2,2.6),
    point(12.5,-152,2.6),point(9.5,-152,5.2),point(8,-152,5.2),point(8,-154,5.2)],
}

// Actor standing/patrol reservations only. AI, combat and scene logic are owned
// by later stages. These paths must remain native capsule/nav walkable.
export const CH3_BLOCKADES = [
  {id:'south-inspection',position:point(-11,-185),patrol:[point(-11,-189),point(-11,-182)]},
  {id:'tower-checkpoint',position:point(-6,-148),patrol:[point(-6,-152),point(-6,-144)]},
  {id:'north-blockade',position:point(-12,-118),patrol:[point(-12,-122),point(-12,-114)]},
]

export const CH3_ASSET_SITES = [
  {id:'south-cover',kind:'cover',position:point(-14,-190),yaw:0},
  {id:'middle-cover',kind:'cover',position:point(-10,-145.5),yaw:Math.PI/2},
  {id:'north-cover',kind:'cover',position:point(-12,-109),yaw:0},
  {id:'safe-workbench',kind:'workbench',position:point(-47,-142,.172),yaw:Math.PI/2},
  {id:'tower-observation',kind:'observation',position:point(12,-154,4.6),yaw:0},
  {id:'south-notice',kind:'sign',position:point(-9,-192),yaw:Math.PI/2},
  {id:'north-notice',kind:'sign',position:point(-8,-113),yaw:Math.PI/2},
]

export const CH3_LOS = {
  hidden:[point(-33,-185),point(-56,-175),point(-56,-163),point(-33.5,-145),point(-33.5,-124)],
  exposed:[point(-20,-190),point(1,-170),point(-20,-143),point(-20,-116)],
  cover:[
    {id:'main-south',from:point(-25.7,-185,1.15),to:point(-21,-185,1.15)},
    {id:'main-middle',from:point(-17,-156,1.15),to:point(-12.5,-156,1.15)},
    {id:'main-north',from:point(-26,-127,1.15),to:point(-21,-127,1.15)},
  ],
}

export const CH3_CAMERAS = [
  {id:'entry-tower',position:point(-53,-193,1.65),target:CH3.tower},
  {id:'tower-frame',position:point(0,-148,1.68),target:point(8,-154,3.2)},
  {id:'main-cover',position:point(-11,-195,1.68),target:point(-14,-190,.9),flashlight:true},
  {id:'main-loading',position:point(-4,-170,1.68),target:point(-10,-148,1.4)},
  {id:'tower-observation',position:point(8, -152,6.88),target:point(12,-154,6),flashlight:true},
  {id:'tower-field',position:CH3.towerEye,target:point(-20,-180,1.65)},
  {id:'west-screen',position:point(-55,-171,1.65),target:point(-33,-178,2.5)},
  {id:'safe-entrance',position:point(-33.5,-142,1.65),target:point(-43,-142,1.65)},
  {id:'safe-interior',position:point(-39,-142,1.852),target:point(-47,-142,1.3)},
  {id:'safe-workbench',position:point(-44,-142,1.852),target:point(-47,-142,1.1)},
  {id:'company-sign',position:point(-6,-192,1.68),target:point(-9,-192,.9),flashlight:true},
  {id:'density-south',position:point(-8,-198,1.68),target:point(8,-186,1.3),flashlight:true},
  {id:'density-west',position:point(-51,-192,1.68),target:point(-43,-185,1.2),flashlight:true},
  {id:'density-loading',position:point(3,-174,1.68),target:point(19,-166,1.1),flashlight:true},
  {id:'density-north',position:point(2,-128,1.68),target:point(17,-137,1.2),flashlight:true},
  {id:'density-pickup',position:point(-5,-189,1.68),target:point(-3.5,-184.8,1.2),flashlight:true},
  {id:'repair-south-shell',position:point(13,-191,1.68),target:point(14,-187,1.2),flashlight:true},
  {id:'repair-loading-shell',position:point(22,-162,1.68),target:point(22,-167,1.2),flashlight:true},
  {id:'repair-north-shell',position:point(18,-141,1.68),target:point(17,-137,1.2),flashlight:true},
  {id:'repair-northeast-mast',position:point(8,-153,6.88),target:point(24,-174,6.5)},
  {id:'repair-tower-apron',position:point(8,-154,6.88),target:point(6,-174,1.2)},
]

export const CH3_WEST_PORTALS = [
  {z:-182,minX:-35,maxX:-30.5},
  {z:-169,minX:-59,maxX:-50.5},
  {z:-156,minX:-35,maxX:-30.5},
  {z:-133,minX:-59,maxX:-50.5},
  {z:-120,minX:-35,maxX:-30.5},
]

export const CH3_MAIN_PORTALS = [
  {z:-176,minX:-1.9,maxX:28},
  {z:-159,minX:-26,maxX:-6.6},
  {z:-132,minX:-1.9,maxX:28},
]
export const CH3_ENTRY_SIGHT = {from:point(-56,-190,1.65),to:CH3.towerEye}
