import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildTaj } from './taj.js';

/**
 * The Taj Mahal mesh: "TAJ MAHAL" by THE CUBE GUY (sketchfab.com/mishrau60),
 * CC BY 4.0, converted to /models/taj.glb. Unlike the Eiffel model it keeps
 * its own photographed marble and inlay textures. If the file is missing or
 * fails to load, the procedural Taj stands in.
 */
const MODEL_URL = '/models/taj.glb';
const HEIGHT = 73; // metres, plinth base to finial
let pending = null;

function loadSource() {
  if (!pending) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    pending = loader.loadAsync(MODEL_URL).then((gltf) => gltf.scene).catch((error) => {
      console.warn('Taj Mahal model unavailable, using the procedural Taj:', error.message);
      return null;
    });
  }
  return pending;
}

/** A group holding the Taj at real height, base centred on the origin, front facing +z. */
export async function loadTaj(fallbackMaterials, { turn = 0 } = {}) {
  const source = await loadSource();
  if (!source) return { group: buildTaj(fallbackMaterials), scanned: false };

  const model = source.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  model.rotation.y = turn;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(HEIGHT / size.y);
  box.setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box.min.y;
  const group = new THREE.Group();
  group.add(model);
  return { group, scanned: true };
}
