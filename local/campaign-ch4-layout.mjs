// M4-A0 static scene. Preserve the fixed L footprint and both original seams.
const p=(x,z,y=0)=>({x,y,z})
export const CH4={
  stage:'M4-A0',sectorId:'blockade-control',bounds:{minX:-80,maxX:-40,minZ:-120,maxZ:8},
  footprint:[[-80,-120],[-60,-120],[-60,-4],[-40,-4],[-40,8],[-80,8]],
  links:[{id:'six-to-control',x:-60,minZ:-116,maxZ:-104},{id:'control-to-seven',x:-40,minZ:2,maxZ:8}],
  spawn:p(-64,-110),spawnYaw:Math.PI,
  console:{position:p(-76,-10),target:p(-76,-10.45,1.05),approach:p(-76,-12),yaw:Math.PI},
  ammo:{position:p(-73,-10),target:p(-73,-10.45,.8),approach:p(-73,-12),yaw:Math.PI},
  gate:{position:p(-70,-7),yaw:Math.PI,closed:true},
  sevenApproach:{gateBoundary:{z:-7,minX:-80,maxX:-60},route:[p(-70,-5),p(-70,2),p(-60,2),p(-44,5)]},
}
export const CH4_CARGO=[
  {id:'entry-west',kind:'container20',x:-77,z:-108,yaw:Math.PI/2},
  // Alternating attached sides remove both centre and perimeter run-throughs.
  {id:'west-transverse',kind:'container40',x:-73.5,z:-94,yaw:0},
  {id:'entry-east',kind:'container20',x:-62.5,z:-82,yaw:Math.PI/2},
  {id:'west-long',kind:'container20',x:-76.8,z:-84,yaw:Math.PI/2},
  {id:'east-transverse',kind:'container40',x:-66.5,z:-68,yaw:0},
  {id:'east-stock',kind:'container20',x:-62.5,z:-56,yaw:Math.PI/2},
  {id:'central-skew',kind:'container40',x:-70.2,z:-43,yaw:.5},
  {id:'staging-west',kind:'container20',x:-77,z:-31,yaw:Math.PI/2},
]
export const CH4_VEHICLES=[
  {id:'entry-loader',kind:'forklift',x:-62.5,z:-101,yaw:Math.PI/2},
  {id:'mid-pickup',kind:'pickup',x:-64.3,z:-76,yaw:Math.PI/2},
  {id:'turn-pickup',kind:'pickup',x:-77,z:-57,yaw:Math.PI/2},
  {id:'turn-loader',kind:'forklift',x:-63,z:-27,yaw:Math.PI/2},
  {id:'gate-defense-pickup',kind:'pickup',x:-74,z:-21,yaw:Math.PI/2},
]
export const CH4_ASSET_SITES=[
  {id:'control-console',kind:'console',...CH4.console},
  {id:'server-west',kind:'server',position:p(-78,-18),yaw:Math.PI/2},
  {id:'server-turn',kind:'server',position:p(-78,-14),yaw:Math.PI/2},
  {id:'server-east',kind:'server',position:p(-62,-13),yaw:-Math.PI/2},
  {id:'security-gate',kind:'gate',...CH4.gate},
  {id:'gate-defense-cover',kind:'cover',position:p(-65,-15),yaw:-Math.PI/2},
  {id:'gate-blockade-notice',kind:'sign',position:p(-64,-9.3),yaw:Math.PI},
]
export const CH4_SPAWNS=[
  ...[[-71,-88],[-68,-88],[-71,-77],[-68,-77]].map(([x,z],i)=>({id:`soldier-${i+1}`,kind:'soldier',radius:.4,position:p(x,z)})),
  ...[[-71,-58],[-68,-58]].map(([x,z],i)=>({id:`hound-${i+1}`,kind:'hound',radius:.65,position:p(x,z)})),
]
export const CH4_ROUTES={
  main:[p(-58,-110),CH4.spawn,p(-69,-108),p(-65,-99),p(-65,-89),p(-75,-77),p(-75,-64),
    p(-70,-59),p(-64,-50),p(-62.2,-45),p(-62.2,-39),p(-64.5,-33),p(-69,-32),p(-70,-22),p(-70,-10)],
  console:[p(-70,-20),p(-74,-16),CH4.console.approach],
  ammo:[p(-70,-16),CH4.ammo.approach],
  serverService:[p(-75,-18.5),p(-75,-15),p(-72,-12),p(-68.2,-11.7),p(-64.4,-11.7)],
  diagonalWest:[p(-75,-64),p(-74,-61),p(-72,-53),p(-77.2,-49),p(-77.2,-40),p(-73,-34),p(-70,-22)],
}
export const CH4_COVER_POSITIONS=[
  {id:'pickup',refuge:p(-74.5,-18.5),peek:p(-70,-18.5),threat:p(-74.5,-29,1.65),blockerTag:'campaign-ch4-vehicle:gate-defense-pickup'},
  {id:'barricade',refuge:p(-64.4,-11.7),peek:p(-68.2,-11.7),threat:p(-64.4,-29,1.65),blockerTag:'campaign-ch4-asset:gate-defense-cover'},
]
CH4_ROUTES.pickupCover=[p(-70,-18.5),CH4_COVER_POSITIONS[0].refuge]
CH4_ROUTES.barricadeCover=[p(-70,-12),CH4_COVER_POSITIONS[1].peek,CH4_COVER_POSITIONS[1].refuge]
CH4_ROUTES.coverSwap=[CH4_COVER_POSITIONS[0].refuge,p(-70,-18.5),p(-69,-12),CH4_COVER_POSITIONS[1].refuge]
export const CH4_CHICANES=[
  {id:'west-transverse',z:-94,minX:-66.7,maxX:-60.8},
  {id:'east-transverse',z:-68,minX:-79.2,maxX:-73.3},
]
export const CH4_CAMERAS=[
  {id:'overview',position:p(-94,-54,42),target:p(-68,-61,0),elevated:true},
  {id:'staging-overview',position:p(-86,-24,22),target:p(-69,-11,0),elevated:true},
  {id:'corridor-forward',position:p(-69,-106,1.65),target:p(-70,-87,1.5)},
  {id:'corridor-reverse',position:p(-70,-22,1.65),target:p(-70.2,-43,1.5)},
  {id:'gate-area',position:p(-69,-23,1.65),target:p(-70,-7,2.3)},
  {id:'gate-defense',position:p(-70,-27,2.2),target:p(-69,-13,1)},
  {id:'servers-console',position:p(-72,-18,1.65),target:p(-76,-10,1.2)},
]
