import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildEiffel } from './eiffel.js';

/**
 * The Eiffel Tower mesh: "( FREE ) La tour Eiffel" by SDC PERFORMANCE
 * (sketchfab.com/Lambo_SC04), CC BY 4.0, converted to /models/eiffel.glb.
 * It ships without textures, so it takes whatever material the scene passes.
 * If the file is missing or fails to load, the procedural tower stands in.
 */
const MODEL_URL = '/models/eiffel.glb';
const HEIGHT = 330; // metres, antenna included
let pending = null;

function loadSource() {
  if (!pending) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    pending = loader.loadAsync(MODEL_URL).then((gltf) => gltf.scene).catch((error) => {
      console.warn('Eiffel model unavailable, using the procedural tower:', error.message);
      return null;
    });
  }
  return pending;
}

/** A group holding the tower at real height, base centred on the origin. */
export async function loadEiffel(material) {
  const source = await loadSource();
  if (!source) return { group: buildEiffel(material).group, scanned: false };

  const model = source.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = material;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  // stand it up at its real height with the base on the ground at the origin
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const up = size.y >= Math.max(size.x, size.z) ? 'y' : 'z';
  if (up === 'z') {
    model.rotation.x = -Math.PI / 2;
    box.setFromObject(model);
    box.getSize(size);
  }
  const scale = HEIGHT / size.y;
  model.scale.multiplyScalar(scale);
  box.setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box.min.y;
  const group = new THREE.Group();
  group.add(model);
  return { group, scanned: true };
}
