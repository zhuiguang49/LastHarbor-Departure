import { chapter4Assets } from '../../assets/harbor/ch4-static/ch4.mesh.mjs'

// Use original g.THREE only. The resource pack owns shared geometry/materials/
// textures. Remove all Groups from scenes before resources.dispose(). Individual
// Groups borrow GPU resources: do not recursively dispose their meshes.
export async function loadChapter4Assets(T) {
  if (T?.REVISION !== '180') throw Error('CH4 assets require original g.THREE r180')
  const models = {}, geometries = [], materials = [], textures = []
  let disposed = false
  const resources = { models, get disposed() { return disposed }, dispose() {
    if (disposed) return
    disposed = true
    for (const resource of [...geometries,...materials,...textures]) resource.dispose()
  } }
  try {
    for (const [kind, asset] of Object.entries(chapter4Assets)) {
      const encoded = atob(asset.data), bytes = new Uint8Array(encoded.length)
      for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i)
      const geometry = new T.BufferGeometry(); geometries.push(geometry)
      for (const name of ['position','normal','uv','index']) {
        const a = asset.attributes[name], ArrayType = a.componentType === 5123 ? Uint16Array : Float32Array
        const attribute = new T.BufferAttribute(new ArrayType(bytes.buffer,a.offset,a.length),a.itemSize)
        if (name === 'index') geometry.setIndex(attribute)
        else geometry.setAttribute(name,attribute)
      }
      geometry.computeBoundingBox(); geometry.computeBoundingSphere()
      const maps = {}
      for (const image of asset.textures) {
        const texture = await new T.TextureLoader().loadAsync(`/assets/harbor/ch4-static/${image.path}`)
        textures.push(texture); maps[image.role] = texture
        texture.name = image.sourceName; texture.flipY = false
        texture.colorSpace = image.role === 'basecolor' ? T.SRGBColorSpace : T.NoColorSpace
        texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearMipmapLinearFilter
        texture.wrapS = T.RepeatWrapping; texture.wrapT = T.RepeatWrapping
        texture.generateMipmaps = true
      }
      // Preserve the supplied GLB's only map, its factors and double-sided flag.
      const pbr = asset.material.pbrMetallicRoughness
      const material = new T.MeshStandardMaterial({ name:asset.material.name, color:0xffffff,
        map:maps.basecolor, metalness:pbr.metallicFactor, roughness:pbr.roughnessFactor, side:T.DoubleSide })
      materials.push(material); models[kind] = { geometry, material }
    }
    return resources
  } catch (error) {
    resources.dispose()
    throw error
  }
}

export function createChapter4Asset(T, resources, kind) {
  if (T?.REVISION !== '180') throw Error('CH4 assets require original g.THREE r180')
  if (!Object.hasOwn(chapter4Assets,kind)) throw Error(`Unknown CH4 asset kind: ${kind}`)
  if (!resources || resources.disposed || !resources.models?.[kind]) throw Error('CH4 resources must be loaded and not disposed')
  const asset = chapter4Assets[kind], shared = resources.models[kind]
  const root = new T.Group(), mesh = new T.Mesh(shared.geometry,shared.material)
  root.name = `campaign-ch4-${kind}`; mesh.name = asset.meshName
  mesh.scale.fromArray(asset.transform.scale); mesh.rotation.y = asset.transform.yawRadians
  mesh.position.fromArray(asset.transform.translation)
  mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh)
  root.userData.kind = kind; root.userData.source = { ...asset.source }
  // Actual normalized local metres, before callers position/rotate the Group.
  root.userData.bounds = structuredClone(asset.bounds)
  root.userData.transform = structuredClone(asset.transform)
  root.updateMatrixWorld(true)
  return root
}
