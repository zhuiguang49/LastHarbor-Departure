import { knifeAsset } from '../../assets/harbor/knife/punhal.mesh.mjs'

// Baked from the supplied STEP assembly. T must be the locked game's g.THREE.
// No loader, fetch, renderer, CAD runtime, or additional Three instance is used.
export function createKnifeModel(T) {
  const root = new T.Group(); root.name = 'harbor-duty-knife'
  const encoded = atob(knifeAsset.data), bytes = new Uint8Array(encoded.length)
  for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i)
  const materials = {
    blade: new T.MeshStandardMaterial({ name:'STEP blade coating', color:0x565e5b, metalness:.78, roughness:.46 }),
    edge: new T.MeshStandardMaterial({ name:'STEP ground steel', color:0xb3b8b4, metalness:.86, roughness:.29 }),
    handle: new T.MeshStandardMaterial({ name:'STEP moulded grip', color:0x252a24, metalness:.02, roughness:.86 }),
  }
  for (const part of knifeAsset.meshes) {
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(bytes.buffer, part.position.offset, part.position.length), 3))
    // CAD normals retain smooth curved faces and discontinuities at hard edges.
    geometry.setAttribute('normal', new T.BufferAttribute(new Int16Array(bytes.buffer, part.normal.offset, part.normal.length), 3, true))
    geometry.setIndex(new T.BufferAttribute(new Uint16Array(bytes.buffer, part.index.offset, part.index.length), 1))
    geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    const mesh = new T.Mesh(geometry, materials[part.material]); mesh.name = part.name
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false
    mesh.userData.cadFaces = part.cadFaces.slice(); root.add(mesh)
  }
  root.userData.grip = knifeAsset.grip.slice()
  root.userData.source = { ...knifeAsset.source }
  root.userData.bounds = structuredClone(knifeAsset.bounds)
  return root
}
