import { pickupAsset } from '/assets/harbor/pickup-derived/pickup.mesh.mjs'

// T is the original game's g.THREE. The environment owns each new geometry and
// material; the preloaded texture is borrowed and must never be disposed here.
export function createPickupModel(T, texture) {
  if (!texture?.isTexture) throw Error('Pickup requires its preloaded base-color texture')
  const root = new T.Group(); root.name = 'campaign-static-pickup'
  const encoded = atob(pickupAsset.data), bytes = new Uint8Array(encoded.length)
  for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i)
  const geometry = new T.BufferGeometry()
  for (const name of ['position','normal','uv']) {
    const part = pickupAsset.attributes[name]
    geometry.setAttribute(name, new T.BufferAttribute(new Float32Array(bytes.buffer, part.offset, part.length), part.itemSize))
  }
  const index = pickupAsset.attributes.index
  geometry.setIndex(new T.BufferAttribute(new Uint16Array(bytes.buffer, index.offset, index.length), 1))
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  const pbr = pickupAsset.material.pbrMetallicRoughness
  const material = new T.MeshStandardMaterial({ name:pickupAsset.material.name, color:0xffffff, map:texture,
    metalness:pbr.metallicFactor, roughness:pbr.roughnessFactor, side:T.DoubleSide })
  const mesh = new T.Mesh(geometry, material); mesh.name = pickupAsset.meshName
  mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh)
  root.castShadow = true; root.receiveShadow = true
  root.scale.setScalar(pickupAsset.uniformScale)
  root.userData.source = { ...pickupAsset.source }
  root.userData.bounds = structuredClone(pickupAsset.bounds)
  root.userData.scale = pickupAsset.uniformScale
  return root
}

export async function loadPickupTexture(T) {
  const texture = await new T.TextureLoader().loadAsync('/assets/harbor/pickup-derived/pickup-basecolor.jpg')
  texture.flipY = false; texture.colorSpace = T.SRGBColorSpace
  // Audited GLB sampler: LINEAR / LINEAR_MIPMAP_LINEAR; omitted wraps = REPEAT.
  texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearMipmapLinearFilter
  texture.wrapS = T.RepeatWrapping; texture.wrapT = T.RepeatWrapping
  texture.generateMipmaps = true
  return texture
}
