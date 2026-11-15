import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

// Offline build tool only. Install the pinned converter in an isolated prefix:
// npm install --prefix .local/last-harbor/knife-tools --ignore-scripts --no-audit --no-fund --save-exact occt-import-js@0.0.23
// Build: node scripts/harbor/convert-knife-asset.mjs
// Verify baked asset against the locked Three: node scripts/harbor/convert-knife-asset.mjs --check
const root = new URL('../../', import.meta.url)
const output = new URL('assets/harbor/knife/', root)
const assetURL = new URL('punhal.mesh.mjs', output)
const manifestURL = new URL('provenance.json', output)
const sourceURL = new URL('assets/harbor/knife/Punhal.STEP', root)
const version = '1.0.0'
const params = { linearUnit:'millimeter', linearDeflectionType:'absolute_value', linearDeflection:.12, angularDeflection:.22 }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const bounds = points => {
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity]
  for (const p of points) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a],p[a]); max[a] = Math.max(max[a],p[a]) }
  return { min, max, size:max.map((v,a) => v-min[a]) }
}
const triples = array => Array.from({length:array.length/3}, (_,i) => array.slice(i*3,i*3+3))

// Boundary connectivity on one broad CAD blade face proves that its four
// openings survive triangulation. This uses topology, not a silhouette trace.
function faceLoops(mesh, face) {
  const edges = new Map(), adjacency = new Map(), index = mesh.index.array
  for (let i = face.first*3; i < (face.last+1)*3; i += 3) for (let j = 0; j < 3; j++) {
    const a = index[i+j], b = index[i+(j+1)%3], key = a < b ? `${a}:${b}` : `${b}:${a}`
    edges.set(key,(edges.get(key)||0)+1)
  }
  for (const [key,count] of edges) if (count === 1) {
    const [a,b] = key.split(':').map(Number)
    for (const [v,w] of [[a,b],[b,a]]) { if (!adjacency.has(v)) adjacency.set(v,[]); adjacency.get(v).push(w) }
  }
  assert.ok([...adjacency.values()].every(v => v.length === 2), 'Closed face boundary loops')
  const seen = new Set(), loops = []
  for (const start of adjacency.keys()) if (!seen.has(start)) {
    const stack = [start], loop = []
    while (stack.length) {
      const v = stack.pop(); if (seen.has(v)) continue
      seen.add(v); loop.push(mesh.attributes.position.array.slice(v*3,v*3+3)); stack.push(...adjacency.get(v))
    }
    loops.push(loop)
  }
  return loops.sort((a,b) => b.length-a.length)
}

function section(mesh, station) {
  const p = mesh.attributes.position.array, index = mesh.index.array, points = []
  for (let i = 0; i < index.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = p.slice(index[i+j]*3,index[i+j]*3+3), b = p.slice(index[i+(j+1)%3]*3,index[i+(j+1)%3]*3+3)
    if ((a[2] < station) !== (b[2] < station)) {
      const t = (station-a[2])/(b[2]-a[2]); points.push(a.map((v,k) => v+t*(b[k]-v)))
    }
  }
  return bounds(points)
}

async function convert() {
  const require = createRequire(import.meta.url)
  const tool = new URL('.local/last-harbor/knife-tools/node_modules/occt-import-js/', root)
  const pkg = JSON.parse(await fs.readFile(new URL('package.json', tool)))
  assert.equal(pkg.version,'0.0.23','Use the documented pinned converter')
  const occt = await require(fileURLToPath(new URL(pkg.main,tool)))()
  const sourceBytes = await fs.readFile(sourceURL)
  const imported = occt.ReadStepFile(sourceBytes,params)
  assert.equal(imported.success,true,'STEP transfer succeeded')
  assert.equal(imported.meshes.length,2,'Blade + handle assembly, not a traced reconstruction')
  const [blade,handle] = imported.meshes
  assert.equal(blade.brep_faces.length,27); assert.equal(handle.brep_faces.length,13)
  const nativeBounds = bounds(imported.meshes.flatMap(m => triples(m.attributes.position.array)))
  // The handle end dome defines the axis; the front guard plane is 3 mm in
  // front of the guard centre. Preserve the STEP's millimetres with no stretch.
  const hb = bounds(triples(handle.attributes.position.array))
  const end = handle.brep_faces[3]
  const endBounds = bounds(handle.index.array.slice(end.first*3,(end.last+1)*3).map(i => handle.attributes.position.array.slice(i*3,i*3+3)))
  const origin = [0,(endBounds.min[1]+endBounds.max[1])/2,hb.min[2]+3]
  const transform = ([x,y,z]) => [(y-origin[1])*.001,(-z+origin[2])*.001,-x*.001]
  const rotate = ([x,y,z]) => [y,-z,-x] // proper rotation: determinant +1
  const palmStation = -60, palmSection = section(handle,palmStation)
  const grip = transform([(palmSection.min[0]+palmSection.max[0])/2,(palmSection.min[1]+palmSection.max[1])/2,palmStation])
  const flatFaces = blade.brep_faces.map((face,i) => ({face,i})).filter(({face}) => {
    const b = bounds(blade.index.array.slice(face.first*3,(face.last+1)*3).map(i => blade.attributes.position.array.slice(i*3,i*3+3)))
    return b.size[0] < 1e-7 && Math.abs(Math.abs(b.min[0])-2) < 1e-7
  })
  const broadFace = flatFaces.reduce((a,b) => a.face.last-a.face.first > b.face.last-b.face.first ? a : b)
  const loops = faceLoops(blade,broadFace.face)
  assert.equal(loops.length,5,'Outer blade perimeter + exactly four true holes')
  const holes = loops.slice(1).map(loop => ({
    bounds:bounds(loop.map(transform)),
    centre:transform([0,1,2].map(a => loop.reduce((s,p) => s+p[a],0)/loop.length)),
    boundaryVertices:loop.length,
  })).sort((a,b) => a.centre[1]-b.centre[1])
  const source = {
    path:'assets/harbor/knife/Punhal.STEP', suppliedPath:'匕首/Punhal.STEP', sha256:hash(sourceBytes), bytes:sourceBytes.length,
    author:'Sergio', headerFileName:'Adaga.STEP', authoredAt:'2016-04-30T14:23:47',
    exporter:'SwSTEP 2.0 / SolidWorks 2014', schema:'STEP AP214 / AUTOMOTIVE_DESIGN',
    usage:'CAD source: Sergio. Third-party terms: see NOTICE.',
  }
  const parts = ['blade','edge','handle'].map(material => ({ material, name:`step-${material}`, positions:[], normals:[], indices:[], cadFaces:[], remap:new Map() }))
  const faceManifest = []
  for (const [mi,mesh] of imported.meshes.entries()) for (const [fi,face] of mesh.brep_faces.entries()) {
    // Constant-thickness blade flats are coating. Tapered ground faces, spine
    // scallops, heel and hole walls expose steel; no guessed replacement faces.
    const material = mi === 1 ? 'handle' : flatFaces.some(f => f.i === fi) ? 'blade' : 'edge'
    const part = parts.find(p => p.material === material), positions = mesh.attributes.position.array, normals = mesh.attributes.normal.array
    part.cadFaces.push(`${mi}:${fi}`)
    for (let i = face.first*3; i < (face.last+1)*3; i++) {
      const old = mesh.index.array[i]
      if (!part.remap.has(old)) {
        part.remap.set(old,part.positions.length/3)
        part.positions.push(...transform(positions.slice(old*3,old*3+3)))
        part.normals.push(...rotate(normals.slice(old*3,old*3+3)))
      }
      part.indices.push(part.remap.get(old))
    }
    faceManifest.push({ part:mi, face:fi, material, triangles:face.last-face.first+1, cadColor:face.color ?? null })
  }
  let offset = 0; const chunks = [], meshes = []
  const pack = array => {
    const padding = (4-offset%4)%4; if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding }
    const record = {offset,length:array.length}; const chunk = Buffer.from(array.buffer,array.byteOffset,array.byteLength)
    chunks.push(chunk); offset += chunk.length; return record
  }
  for (const p of parts) {
    assert.ok(p.positions.length/3 < 65536)
    meshes.push({ name:p.name, material:p.material, cadFaces:p.cadFaces,
      position:pack(new Float32Array(p.positions)), normal:pack(new Int16Array(p.normals.map(v => Math.round(Math.max(-1,Math.min(1,v))*32767)))), index:pack(new Uint16Array(p.indices)),
    })
  }
  const binary = Buffer.concat(chunks)
  const asset = { version, source, grip, bounds:bounds(parts.flatMap(p => triples(p.positions))), meshes, data:binary.toString('base64') }
  const module = `// Generated from the user-supplied STEP. Do not hand-edit; see provenance.json.\nexport const knifeAsset = ${JSON.stringify(asset)}\n`
  const manifest = {
    converter:{ name:'occt-import-js', version:pkg.version, project:'https://github.com/kovacsv/occt-import-js', scriptVersion:version,
      wasmSha256:hash(await fs.readFile(new URL('dist/occt-import-js.wasm',tool))), params },
    source, originalHeader:sourceBytes.toString('latin1').split('ENDSEC;')[0]+'ENDSEC;',
    assembly:imported.root, originalUnits:'mm', originalBounds:nativeBounds,
    transform:{ originInSourceMillimeters:origin, mapping:'X=(sourceY-originY)*0.001; Y=(-sourceZ+originZ)*0.001; Z=-sourceX*0.001', determinant:1, scale:.001 },
    grip:{ position:grip, sourcePalmStationMillimeters:palmStation, sourceSectionMillimeters:palmSection, method:'Centre of actual handle cross-section at palm station; tang occupies its internal slot.' },
    bounds:asset.bounds, holes, cadFaces:faceManifest,
    normals:'OCCT analytic surface normals, rotated and SNORM16 encoded. CAD face seams retained; never recomputed across hard edges.',
    encoding:'Little-endian Float32 XYZ metres, normalized Int16 XYZ normals, Uint16 triangle indices; 4-byte aligned. Base64 ESM for synchronous construction, no runtime loader.',
    output:{ module:'punhal.mesh.mjs', sha256:hash(module), bytes:Buffer.byteLength(module), binaryBytes:binary.length,
      meshes:parts.map(p => ({ name:p.name, vertices:p.positions.length/3, triangles:p.indices.length/3 })), triangles:parts.reduce((n,p) => n+p.indices.length/3,0) },
    integration:{ factory:'scripts/harbor/knife-asset.mjs', call:'createKnifeModel(g.THREE)', rootName:'harbor-duty-knife',
      serve:['/local/knife-asset.mjs','/assets/harbor/knife/punhal.mesh.mjs'], grip:'root.userData.grip is local palm centre in metres; do not centre the model at its bounding box.' },
  }
  await fs.mkdir(output,{recursive:true})
  await fs.writeFile(assetURL,module)
  await fs.writeFile(manifestURL,JSON.stringify(manifest,null,2)+'\n')
}

async function verify() {
  const manifest = JSON.parse(await fs.readFile(manifestURL))
  assert.equal(hash(await fs.readFile(sourceURL)),manifest.source.sha256)
  assert.equal(hash(await fs.readFile(assetURL)),manifest.output.sha256)
  const { createKnifeModel } = await import('./knife-asset.mjs')
  const html = await fs.readFile(new URL('几猫国产3A大作_V1-fable5.2.html',root),'utf8')
  const code = html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'))
  const startup = 'QC().catch(i=>bM(i&&i.stack||i));'
  assert.equal(code.split(startup).length,2)
  const noop = () => {}, box = { console, document:{getElementById:() => ({})}, addEventListener:noop, setTimeout:noop, URLSearchParams, performance, AbortController, TextDecoder, Float32Array, Int16Array, Uint16Array, navigator:{userAgent:''}, location:{search:''} }; box.window = box
  vm.runInNewContext(code.replace(startup,'globalThis.THREE=lt;'),box)
  const T = box.THREE, model = createKnifeModel(T)
  assert.equal(model.name,'harbor-duty-knife'); assert.equal(model.children.length,3)
  assert.deepEqual(model.userData.grip,manifest.grip.position)
  assert.equal(model.userData.source.sha256,manifest.source.sha256)
  const dimensions = new T.Box3().setFromObject(model).getSize(new T.Vector3())
  assert.ok(dimensions.y >= .32 && dimensions.y <= .38)
  const stats = { meshes:model.children.length, triangles:0, vertices:0, finite:true, unitNormals:true, reversedTriangles:0, degenerateTriangles:0, maxNormalLengthError:0 }
  for (const mesh of model.children) {
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal, index = g.index.array
    stats.vertices += p.count; stats.triangles += index.length/3
    assert.equal(p.count,n.count); assert.ok(mesh.material.isMeshStandardMaterial)
    assert.equal(mesh.material.emissive.getHex(),0); assert.equal(mesh.material.side,T.FrontSide)
    for (const v of p.array) assert.ok(Number.isFinite(v))
    for (let i = 0; i < n.count; i++) {
      const v = new T.Vector3().fromBufferAttribute(n,i), error = Math.abs(v.length()-1)
      assert.ok(Number.isFinite(v.length()) && error < .00006)
      stats.maxNormalLengthError = Math.max(stats.maxNormalLengthError,error)
    }
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), ab = new T.Vector3(), ac = new T.Vector3(), normal = new T.Vector3()
    for (let i = 0; i < index.length; i += 3) {
      assert.ok(index[i] < p.count && index[i+1] < p.count && index[i+2] < p.count)
      a.fromBufferAttribute(p,index[i]); b.fromBufferAttribute(p,index[i+1]); c.fromBufferAttribute(p,index[i+2])
      ab.subVectors(b,a); ac.subVectors(c,a); ab.cross(ac)
      if (ab.lengthSq() < 1e-28) stats.degenerateTriangles++
      normal.set(0,0,0)
      for (let j = 0; j < 3; j++) normal.add(new T.Vector3().fromBufferAttribute(n,index[i+j]))
      if (ab.dot(normal) < -1e-14) stats.reversedTriangles++
    }
  }
  assert.equal(stats.triangles,manifest.output.triangles)
  assert.ok(stats.triangles < 20000); assert.ok(manifest.output.bytes < 500000)
  assert.equal(stats.degenerateTriangles,0); assert.equal(stats.reversedTriangles,0)
  // Weld positions for topology analysis only. Runtime vertices stay split at
  // CAD face boundaries so this check never smooths away a hard cutting edge.
  const shells = [['blade','edge'],['handle']].map(materials => {
    const vertices = new Map(), edges = new Map(); let faces = 0
    for (const mesh of model.children.filter(m => materials.includes(m.name.slice(5)))) {
      const p = mesh.geometry.attributes.position.array, index = mesh.geometry.index.array, welded = []
      for (let i = 0; i < p.length; i += 3) {
        const key = [p[i],p[i+1],p[i+2]].map(v => Math.round(v/1e-7)).join(',')
        if (!vertices.has(key)) vertices.set(key,vertices.size)
        welded.push(vertices.get(key))
      }
      faces += index.length/3
      for (let i = 0; i < index.length; i += 3) for (let j = 0; j < 3; j++) {
        const a = welded[index[i+j]], b = welded[index[i+(j+1)%3]], key = a < b ? `${a}:${b}` : `${b}:${a}`
        edges.set(key,(edges.get(key)||0)+1)
      }
    }
    const unpairedEdges = [...edges.values()].filter(n => n !== 2).length
    assert.equal(unpairedEdges,0,'Every shell edge has exactly two incident triangles')
    const euler = vertices.size-edges.size+faces
    return { materials, weldedVertices:vertices.size, edges:edges.size, faces, unpairedEdges, eulerCharacteristic:euler, genus:(2-euler)/2 }
  })
  assert.equal(shells[0].genus,4,'Closed blade has four topological through-holes')
  assert.equal(shells[1].genus,0,'Handle is a closed CAD shell')
  const steel = model.children.filter(m => m.name !== 'step-handle')
  const ray = (x,y,z,sign) => new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(0,0,sign),0,.03).intersectObjects(steel,false).length
  const holeRays = manifest.holes.map(h => {
    const [x,y] = h.centre
    assert.equal(ray(x,y,.01,-1),0,'Hole passes through front of actual runtime mesh')
    assert.equal(ray(x,y,-.01,1),0,'Hole passes through back of actual runtime mesh')
    // Offset to the solid web beside the same hole, to make the test non-vacuous.
    assert.ok(ray(h.bounds.min[0]-.001,y,.01,-1)>0,'Adjacent blade is solid')
    return { centre:[x,y,0], frontClear:true, backClear:true, adjacentWebSolid:true }
  })
  assert.equal(holeRays.length,4)
  const grip = new T.Vector3(...model.userData.grip), handle = model.getObjectByName('step-handle')
  const palmHits = [-1,1].map(sign => new T.Raycaster(grip.clone().add(new T.Vector3(0,0,sign*.05)),new T.Vector3(0,0,-sign),0,.05).intersectObject(handle).length)
  assert.ok(palmHits.every(n => n > 0),'Palm anchor lies between the real handle surfaces')
  const report = { success:true, lockedThreeRevision:T.REVISION, ...stats, shells, dimensionsMeters:dimensions.toArray(), grip:model.userData.grip, palmHandleHits:palmHits, holes:holeRays }
  await fs.writeFile(new URL('verification.json',output),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}

if (!process.argv.includes('--check')) await convert()
await verify()
