import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Photogrammetry scans from Sketchfab, converted to meshopt GLBs in
 * public/models (see the model:* npm scripts). Each file is fetched once and
 * cloned wherever it is used, so the lobby miniatures and the full scenes
 * share one download.
 */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function loadScanSource(url) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((gltf) => gltf.scene).catch((error) => {
      console.warn(`Scan unavailable (${url}):`, error.message);
      return null;
    }));
  }
  return cache.get(url);
}

/**
 * A clone of a scan, turned by `turn` radians, scaled so it stands `height`
 * tall (or by `scale`), with its footprint centred on the origin and its
 * lowest point on y = 0. Returns null when the file is missing.
 */
export async function placeScan(url, { height, scale, turn = 0, shadows = true } = {}) {
  const source = await loadScanSource(url);
  if (!source) return null;
  const model = source.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadows;
    o.receiveShadow = shadows;
  });
  model.rotation.y = turn;
  // precise bounds: the scans carry rotated node transforms that inflate the fast box
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(height ? height / size.y : scale ?? 1);
  box.setFromObject(model, true);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box.min.y;
  const group = new THREE.Group();
  group.add(model);
  return { group, size: box.getSize(new THREE.Vector3()) };
}
