// M2-B0.5 environment only. Metres, Y up; native ground/perimeter remain integration-owned.
function freezeData(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeData(child)
  return Object.freeze(value)
}
const points = coordinates => coordinates.map(([x,z]) => ({ x, y: 0, z }))
const radians = degrees => degrees * Math.PI / 180
const H = 2.59, W = 2.44

export const CH2_ROUTES = freezeData({
  s1: points([[-60,-285.5],[-72,-285.5],[-72,-289.5],[-88,-289.5],[-88,-281.5],
    [-103,-281.5],[-103,-275.5],[-120.5,-275.5],[-120.5,-267]]),
  s1Branch: points([[-88,-281.5],[-88,-275.5],[-103,-275.5]]),
  s2: points([[-120.5,-267],[-120.5,-255.5],[-125.5,-255.5],[-125.5,-244.5],
    [-117.5,-244.5],[-117.5,-232.5],[-123.5,-232.5],[-123.5,-220.5],
    [-120.5,-216.5],[-120.5,-208],[-120.5,-201]]),
  maintenance: points([[-120.5,-259.5],[-148.5,-259.5],[-148.5,-246.5],[-143.5,-246.5],
    [-143.5,-233.5],[-148.5,-233.5],[-148.5,-210.5],[-120.5,-210.5]]),
  s3: points([[-120.5,-201],[-120.5,-190.5],[-105.5,-190.5],[-105.5,-185.5],
    [-92.5,-185.5],[-92.5,-192.5],[-78.5,-192.5],[-78.5,-190.5],[-70,-190.5],
    [-65,-190.5],[-60,-190.5]]),
})

export const CH2_SECTIONS = freezeData([
  { id: 'ch2.s1', name: '回声货道', routeId: 's1', branchIds: ['s1Branch'],
    bounds: { minX: -128, maxX: -60, minZ: -300, maxZ: -271 }, identity: 'low-orange-cargo' },
  { id: 'ch2.s2', name: '倾覆迷宫', routeId: 's2', branchIds: ['maintenance'],
    bounds: { minX: -160, maxX: -109, minZ: -264, maxZ: -205 }, identity: 'braced-tilted-high-stacks' },
  { id: 'ch2.s3', name: '盲区尽头', routeId: 's3', branchIds: [],
    bounds: { minX: -128, maxX: -69, minZ: -198, maxZ: -180 }, identity: 'overhead-bridge-blind-turns' },
])

// Native end apertures are 2.30m wide; nav cells and inflation are both .5m.
// Half-cell centres also allow a separate 1m/.55m clearance stress check.
export const CH2_SAFE_ZONES = freezeData([
  { id: 'ch2.safe.a', name: '维修值班室', shellId: 'safe-a', x: -120.5, z: -267, yaw: Math.PI / 2 },
  { id: 'ch2.safe.b', name: '货运调度站', shellId: 'safe-b', x: -120.5, z: -201, yaw: Math.PI / 2 },
  { id: 'ch2.safe.c', name: '六号入口隔离室', shellId: 'safe-c', x: -65, z: -190.5, yaw: 0 },
].map(zone => ({ ...zone, position: { x: zone.x, y: .172, z: zone.z },
  bounds: Math.abs(zone.yaw) > 1 ?
    { minX: zone.x - 1.1, maxX: zone.x + 1.1, minZ: zone.z - 2.9, maxZ: zone.z + 2.9 } :
    { minX: zone.x - 2.9, maxX: zone.x + 2.9, minZ: zone.z - 1.1, maxZ: zone.z + 1.1 },
  entrances: [-1,1].map(end => Math.abs(zone.yaw) > 1 ? {
    id: `${zone.id}.${end<0?'south':'north'}`,
    min: [zone.x-1.15,.172,zone.z+end*3.03-.04], max: [zone.x+1.15,2.5,zone.z+end*3.03+.04],
    outside: {x:zone.x,y:0,z:zone.z+end*4.53}, inside: {x:zone.x,y:.172,z:zone.z+end*1.5},
  } : {
    id: `${zone.id}.${end<0?'west':'east'}`,
    min: [zone.x+end*3.03-.04,.172,zone.z-1.15], max: [zone.x+end*3.03+.04,2.5,zone.z+1.15],
    outside: {x:zone.x+end*4.53,y:0,z:zone.z}, inside: {x:zone.x+end*1.5,y:.172,z:zone.z},
  }),
  // Physical shell/parked doors only; protection and checkpoint logic are B2.
  stage: 'shell-only', spawnAllowed: false,
})))

export const CH2_SPAWNS = freezeData([
  [[-67,-285.5],[-81,-289.5],[-96,-281.5],[-88,-275.5],[-108,-275.5],[-120.5,-275.5]],
  [[-120.5,-258],[-125.5,-249],[-117.5,-238.5],[-123.5,-224],[-143.5,-240],[-148.5,-218]],
  [[-120.5,-193],[-110,-190.5],[-100,-185.5],[-92.5,-189.5],[-85.5,-192.5],[-73,-190.5]],
].flatMap((sites, section) => sites.map(([x,z], index) => ({
  id: `ch2.s${section + 1}.z${index + 1}`, sectionId: `ch2.s${section + 1}`,
  position: { x, y: 0, z }, debugOnly: true,
}))))

const containers = []
function box(id, sectionId, x, z, { name = 'container40', yaw = 0, tiers = 1, variant = 0 } = {}) {
  for (let tier = 0; tier < tiers; tier++) containers.push({ id: `${id}.${tier}`, sectionId, name, x,
    y: tier * H, z, yaw, roll: 0, variant: (variant + tier) % 3, open: false,
    supportIds: tier ? [`${id}.${tier - 1}`] : ['ground'] })
}
// Low freight fingers force three readable alternating turns at the entrance.
for (const [index,x] of [-67,-79.19,-91.38,-103.57,-115.76].entries()) box(`s1-south-${index}`, 'ch2.s1', x,-298.4)
for (const [index,x] of [-66.1,-79.19,-91.38,-103.57].entries()) box(`s1-north-${index}`, 'ch2.s1', x,-271.5, { tiers: index % 2 + 1, variant: 1 })
box('s1-finger-a','ch2.s1',-78,-281.5,{yaw:Math.PI/2,tiers:2,variant:1})
box('s1-finger-b','ch2.s1',-94,-290.5,{yaw:Math.PI/2})
box('s1-finger-c','ch2.s1',-109,-285.8,{yaw:Math.PI/2,tiers:2,variant:1})
box('s1-west','ch2.s1',-128,-284,{yaw:Math.PI/2,tiers:2})

// Tall east bank and west maintenance lane; no scenery outside the footprint.
for (const [index,z] of [-256,-243.81,-231.62,-219.43,-207.24].entries()) box(`s2-east-${index}`,'ch2.s2',-111.5,z,{yaw:Math.PI/2,tiers:[2,3,1,3,2][index]})
// Join the inner storage bank to both return lanes. Its former corner gaps
// let native nav skip the entire middle section through the eastern stockyard.
box('s2-east-north-return','ch2.s2',-110.8,-266.1,{yaw:Math.PI/2,tiers:2})
box('s2-east-south-return','ch2.s2',-111.5,-199.3,{name:'container20',yaw:Math.PI/2})
for (const [index,z] of [-251,-219].entries()) box(`s2-divider-${index}`,'ch2.s2',-135,z,{yaw:Math.PI/2,tiers:3})
for (const [index,z] of [-253,-238,-223,-208].entries()) box(`s2-west-${index}`,'ch2.s2',-156.5,z,{yaw:Math.PI/2,tiers:index%2+1,variant:2})
for (const [index,x,z] of [[0,-118.5,-250],[1,-128.5,-239],[2,-115.5,-226],[3,-129.5,-214]]) box(`s2-chicane-${index}`,'ch2.s2',x,z,{name:'container20',tiers:index%2+1})
box('s2-tilt-support','ch2.s2',-130.4,-236,{name:'container20',variant:2})
const roll = Math.asin(H / 12.19)
containers.push({ id: 's2-tilted', sectionId: 'ch2.s2', name: 'container40', x: -136, z: -236,
  y: H / 2, yaw: 0, roll, variant: 1, open: false, supportIds: ['ground','s2-tilt-support.0'] })
box('s2-oblique','ch2.s2',-141,-250,{name:'container20',yaw:radians(-25),variant:2})

// Low end supports carry the transverse bridge; its full width clears standing.
box('s3-bridge-south','ch2.s3',-110,-196,{name:'container20',variant:2})
box('s3-bridge-north','ch2.s3',-110,-185,{name:'container20',variant:2})
containers.push({ id:'s3-bridge', sectionId:'ch2.s3', name:'container40', x:-110,y:H,z:-190.5,
  yaw:Math.PI/2,roll:0,variant:0,open:false,supportIds:['s3-bridge-south.0','s3-bridge-north.0'] })
for (const [index,x] of [-119,-106.81,-94.62,-82.43,-70.24].entries()) box(`s3-north-${index}`,'ch2.s3',x,-181.5,{tiers:index%2+1,variant:2})
for (const [index,x] of [-101,-88.81,-76.62].entries()) box(`s3-south-${index}`,'ch2.s3',x,-198,{tiers:2})
for (const [index,x] of [-67.6,-63.05].entries()) box(`s3-inner-return-${index}`,'ch2.s3',x,-198,{name:'container20'})
box('s3-blind-a','ch2.s3',-100,-195.5,{yaw:Math.PI/2,tiers:2,variant:2})
box('s3-blind-b','ch2.s3',-87,-184.5,{name:'container20',yaw:Math.PI/2,variant:2})
box('s3-blind-c','ch2.s3',-74,-197,{name:'container20',yaw:Math.PI/2})

for (const [id,sectionId,x,z,yaw] of [
  ['open-echo','ch2.s1',-96,-281.5,0],['open-maze','ch2.s2',-117.5,-238.5,Math.PI/2],
  ['open-exit','ch2.s3',-85.5,-192.5,0],
]) containers.push({id,sectionId,name:'container20',x,y:0,z,yaw,roll:0,variant:2,open:true,supportIds:['ground']})
for (const zone of CH2_SAFE_ZONES) containers.push({ id:zone.shellId,sectionId:zone.id,name:'container20',
  x:zone.x,y:0,z:zone.z,yaw:zone.yaw,roll:0,variant:0,open:true,safeZoneId:zone.id,supportIds:['ground'] })

export const CH2_CONTAINERS = freezeData(containers)

// Same Euler order as THREE.Euler(0,yaw,roll,'YXZ'): roll first, then yaw.
export function chapter2Transform(item, point) {
  const c = Math.cos(item.yaw), s = Math.sin(item.yaw), cr = Math.cos(item.roll), sr = Math.sin(item.roll)
  const x = point[0] * cr - point[1] * sr, y = point[0] * sr + point[1] * cr
  return [item.x + x*c + point[2]*s, item.y+y, item.z-x*s+point[2]*c]
}

function transformedBox(item, min, max) {
  const corners = []
  for (const x of [min[0],max[0]]) for (const y of [min[1],max[1]]) for (const z of [min[2],max[2]]) corners.push(chapter2Transform(item,[x,y,z]))
  return { min:[0,1,2].map(axis=>Math.min(...corners.map(p=>p[axis]))),
    max:[0,1,2].map(axis=>Math.max(...corners.map(p=>p[axis]))) }
}

// Local thin shell matches zA(doors:1). Rear panel is removed in the visual too.
export function chapter2LocalBoxes(item) {
  const p = (item.name === 'container40' ? 12.19 : 6.06) / 2, f = W/2
  const shell = [
    { min:[-p,0,-f],max:[p,.172,f],surface:'wood',part:'floor' },
    { min:[-p,H-.09,-f],max:[p,H,f],surface:'metal',part:'roof' },
    ...[-1,1].map(side=>({ min:[-p,0,side<0?-f:f-.07],max:[p,H,side<0?-f+.07:f],surface:'metal',part:'side' })),
  ]
  if (!item.open) shell.push(...[-1,1].map(side=>({min:[side<0?-p:p-.07,0,-f],max:[side<0?-p+.07:p,H,f],surface:'metal',part:'end'})))
  else {
    // Full doors swing out from the +X end, exactly as the native factory does.
    for (const side of [1,-1]) {
      const angle = radians(side>0?112:88), hinge=side*(f-.058), width=f-.062
      for (let segment=0;segment<3;segment++) {
        const a=width*segment/3,b=width*(segment+1)/3
        const x1=p-.066+Math.sin(angle)*a,x2=p-.066+Math.sin(angle)*b
        const z1=hinge-side*Math.cos(angle)*a,z2=hinge-side*Math.cos(angle)*b
        shell.push({min:[Math.min(x1,x2)-.03,.175,Math.min(z1,z2)-.03],
          max:[Math.max(x1,x2)+.03,H-.124,Math.max(z1,z2)+.03],surface:'metal',part:'door'})
      }
    }
  }
  return shell
}

// Rotated shells use thin wall/slab strips, never a whole-container AABB.
// Closed cardinal cargo can use the native factory's single solid box.
export function getChapter2Colliders() {
  const result=[]
  for (const item of CH2_CONTAINERS) {
    const oblique=Math.abs(Math.sin(2*item.yaw))>1e-8, tilted=Math.abs(item.roll)>1e-8
    const p=(item.name==='container40'?12.19:6.06)/2
    const local=!item.open&&!oblique&&!tilted ? [{min:[-p,0,-W/2],max:[p,H,W/2],surface:'metal',part:'solid'}] : chapter2LocalBoxes(item)
    for (const box of local) {
      // An upright closed floor rests on the existing analytic ground. Omitting
      // its redundant low slab also follows native ob.place's <.3m floor filter.
      if (!item.open&&!tilted&&box.part==='floor') continue
      const divisions=[0,1,2].map(axis => {
        if (oblique && axis!==1) return Math.ceil((box.max[axis]-box.min[axis])/.4)
        if (tilted && axis===0) return Math.ceil((box.max[axis]-box.min[axis])/.4)
        if (tilted && axis===1) return Math.ceil((box.max[axis]-box.min[axis])/.8)
        return 1
      })
      for(let x=0;x<divisions[0];x++) for(let y=0;y<divisions[1];y++) for(let z=0;z<divisions[2];z++) {
        const indices=[x,y,z], min=indices.map((n,a)=>box.min[a]+(box.max[a]-box.min[a])*n/divisions[a])
        const max=indices.map((n,a)=>box.min[a]+(box.max[a]-box.min[a])*(n+1)/divisions[a])
        result.push({id:`${item.id}:${box.part}:${result.length}`,containerId:item.id,part:box.part,
          ...transformedBox(item,min,max),surface:box.surface,tag:'campaign-ch2-shell'})
      }
    }
  }
  return result
}

export function getChapter2Interiors() {
  return CH2_CONTAINERS.filter(item=>item.open && !item.roll && Math.abs(Math.sin(2*item.yaw))<1e-8)
    .map(item=>({id:item.id,...transformedBox(item,[-(item.name==='container40'?12.19:6.06)/2+.08,.172,-W/2+.07],
      [(item.name==='container40'?12.19:6.06)/2-.08,H-.09,W/2-.07])}))
}

// B0 anchors above are immutable. Only the supplemental traversal/props below
// change when a real native capsule/nav check requires a wider turn.
const obstacles=[]
function obstacle(id,sectionId,kind,x,z,options={}) {
  obstacles.push({id:`ch2.obstacle.${id}`,sectionId,kind,x,y:0,z,yaw:0,...options})
}
function cargoRow(id,sectionId,x1,z1,x2,z2) {
  const length=Math.hypot(x2-x1,z2-z1),count=Math.ceil(length/.95)
  for(let i=0;i<=count;i++)obstacle(`${id}.${i}`,sectionId,'crate_stack',x1+(x2-x1)*i/count,z1+(z2-z1)*i/count)
}
obstacle('s1.forklift','ch2.s1','forklift',-77.9,-290.7,{yaw:Math.PI/2,options:{forksUp:0}})
obstacle('s1.forklift-north','ch2.s1','crate_stack',-77.9,-288.05)
cargoRow('s1.forklift-south','ch2.s1',-77.9,-291.8,-77.9,-292.4)
cargoRow('s1.finger-north','ch2.s1',-77.9,-274.85,-77.9,-273.2)
obstacle('s1.barrier','ch2.s1','jersey_barrier',-86.3,-295.65,{yaw:Math.PI/2,options:{stripe:true}})
obstacle('s1.tarp','ch2.s1','tarp_cargo',-84.2,-292.9,{yaw:Math.PI/2})
cargoRow('s1.south-baffle','ch2.s1',-84.2,-296.6,-84.2,-291.4)
cargoRow('s1.finger-south-close','ch2.s1',-109,-292.3,-109,-296.6)
cargoRow('s1.west-south','ch2.s1',-110.5,-279.3,-110.5,-276.2)
cargoRow('s1.west-north','ch2.s1',-116,-273.3,-116,-276.3)
// Closed cargo forms the northern return. The real A-room entrance stays open.
cargoRow('s1.north-return-east','ch2.s1',-118,-272.1,-110,-272.1)
cargoRow('s1.north-return-west','ch2.s1',-126.8,-272.1,-123,-272.1)
obstacle('s1.pallet','ch2.s1','pallet_stack',-112,-278,{options:{count:8}})
obstacle('s2.pickup','ch2.s2','pickup',-121,-253,{yaw:Math.PI/2})
cargoRow('s2.main-south','ch2.s2',-134,-253.5,-128,-253.5)
cargoRow('s2.main-middle','ch2.s2',-134,-241.5,-121.5,-241.5)
for(const [i,z1,z2] of [[0,-257.8,-257.095],[1,-244.905,-237.22],[2,-234.78,-225.095],[3,-212.905,-212.2]])cargoRow(`s2.divider.${i}`,'ch2.s2',-135,z1,-135,z2)
for(const [id,x,z,width] of [['a',-149,-253.5,3],['b',-144.05,-242.8,3.5],['c',-148.5,-224.5,3]])obstacle(`s2.plate.${id}`,'ch2.s2','steel_plate',x,z,{width})
obstacle('s2.fallen-stack','ch2.s2','crate_stack',-150.3,-231.2)
obstacle('s2.fallen-crate','ch2.s2','crate_wood',-149.2,-231.2,{roll:Math.PI/2,y:.55})
obstacle('s2.tarp','ch2.s2','tarp_cargo',-146.7,-216.8,{yaw:Math.PI/2})
for(const [id,x,z,yaw] of [['s2.inside-south',-116.68,-240.15,Math.PI/2],['s2.inside-north',-118.32,-236.85,Math.PI/2],['s3.inside',-83.85,-191.68,0]])obstacle(id,id.startsWith('s2')?'ch2.s2':'ch2.s3','crate_wood',x,z,{y:.172,yaw,scale:.6})
obstacle('s3.rack','ch2.s3','shelf_rack',-105.5,-188,{yaw:Math.PI/2})
obstacle('s3.fence','ch2.s3','fence_panel',-95.3,-187,{pitch:55*Math.PI/180,y:.14})
obstacle('s3.fence-support','ch2.s3','crate_wood',-95.3,-185.7,{scale:.8})
cargoRow('s3.south-screen','ch2.s3',-100,-189.4,-100,-187.3)
cargoRow('s3.north-screen','ch2.s3',-95.3,-184.7,-95.3,-183.2)
obstacle('s3.pallet-a','ch2.s3','pallet_stack',-90.5,-193.8,{options:{count:8}})
cargoRow('s3.exit-screen','ch2.s3',-80.5,-183.2,-80.5,-190)
obstacle('s3.pallet-b','ch2.s3','pallet_stack',-76.1,-190.3,{options:{count:8}})
// Full-height closed cases have no .95m climbing ledge at the two S screens.
for(const item of obstacles)if(/^ch2.obstacle.s1.(west-|finger-south-close)/.test(item.id)){item.kind='crate_wood';item.scale=1.6}
export const CH2_OBSTACLES=freezeData(obstacles)

function traversals(id,insertions) {
  return CH2_ROUTES[id].flatMap((p,i)=>[p,...points(insertions[i]||[])])
}
export const CH2_TRAVERSAL_ROUTES=freezeData({
  s1:traversals('s1',{2:[[-74.5,-289.5],[-75.8,-294],[-80,-294],[-81.5,-289.5],[-86,-289.5]],6:[[-108,-275.5],[-108,-274],[-113,-274],[-114.5,-274],[-114.5,-278.2],[-118,-278.2]]}),
  s1Branch:CH2_ROUTES.s1Branch,
  s2:traversals('s2',{2:[[-125.5,-254.5],[-126.5,-252],[-125.5,-249]]}),
  maintenance:traversals('maintenance',{1:[[-151.5,-255.5],[-151.5,-252],[-148.5,-250]],3:[[-146.8,-244.5],[-146.8,-241.5],[-143.5,-240]],5:[[-152,-233],[-152,-230],[-151.5,-228.5],[-145.8,-226.2],[-145.8,-223],[-148.5,-220]]}),
  s3:traversals('s3',{2:[[-103.4,-190.5],[-103.4,-186]],3:[[-100,-185.5],[-98.5,-185.5],[-98.5,-188.5],[-93.5,-188.5],[-92.5,-187]],5:[[-91.2,-190.5],[-89,-190.5],[-89,-192.5],[-85.5,-192.5],[-82.5,-192.9],[-81,-192.5]],7:[[-77.5,-188.7],[-74.6,-188.7],[-72.2,-190.5]]}),
})
export const CH2_CHICANES=freezeData([
  {id:'ch2.chicane.a',sectionId:'ch2.s1',entry:{x:-72,y:0,z:-289.5},exit:{x:-88,y:0,z:-289.5},
    portals:[{axis:'x',value:-77.9,min:-300,max:-292.7,side:'south'},{axis:'x',value:-84.2,min:-290.6,max:-180,side:'north'}],
    obstacleIds:obstacles.filter(o=>/^ch2.obstacle.s1.(forklift|finger-north|barrier|tarp|south-baffle)/.test(o.id)).map(o=>o.id)},
  {id:'ch2.chicane.b',sectionId:'ch2.s1',entry:{x:-103,y:0,z:-275.5},exit:{x:-120.5,y:0,z:-275.5},
    portals:[{axis:'x',value:-110.5,min:-275.7,max:-180,side:'north'},{axis:'x',value:-116,min:-300,max:-277.1,side:'south'}],
    obstacleIds:obstacles.filter(o=>/^ch2.obstacle.s1.(west-|north-return|finger-south-close)/.test(o.id)).map(o=>o.id)},
])

export const CH2 = freezeData({stage:'M2-B0.5',sectorId:'blackbox-yard',bounds:{minX:-160,maxX:-60,minZ:-300,maxZ:-180},
  links:[{id:'five-to-yard',x:-60,minZ:-291,maxZ:-279},{id:'yard-to-six',x:-60,minZ:-196,maxZ:-184}],
  routes:CH2_ROUTES,traversalRoutes:CH2_TRAVERSAL_ROUTES,obstacles:CH2_OBSTACLES,chicanes:CH2_CHICANES,sections:CH2_SECTIONS,safeZones:CH2_SAFE_ZONES,spawns:CH2_SPAWNS,containers:CH2_CONTAINERS,
  playerRadius:.32,navRadius:.5,navCell:.5,containerHeight:H,containerWidth:W})
