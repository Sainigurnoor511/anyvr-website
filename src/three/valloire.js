import * as THREE from 'three';
import { CameraPath } from './util.js';
import { scanned } from './textures.js';
import { placeScan } from './scans.js';

/**
 * Inside Notre-Dame de l'Assomption, Valloire, in the French Alps: a
 * photogrammetry scan ("Baroque church - Notre Dame de l'Assomption" by
 * egiptologo91, CC BY-NC 4.0) of the nave, the painted vault and the gilded
 * altarpiece. Its light is baked into the scan, so the scene adds only a
 * stone floor and the dark beyond the windows.
 */
export async function createValloire(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0b09');
  scene.add(new THREE.HemisphereLight('#f1e2c8', '#2a2018', 1.2));

  const placed = await placeScan('/models/valloire.glb', { height: 18, shadows: false });
  const size = placed ? placed.size : new THREE.Vector3(26, 18, 33);
  if (placed) scene.add(placed.group);

  // the scan has no floor; lay worn stone flags under the nave
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.4, size.z * 1.4),
    scanned('old_sandstone_02', { color: 0xb3a490, roughness: 0.8 }, { scale: 0.5, saturation: 0.45, gain: 1.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.05;
  scene.add(floor);

  // walk up the nave toward the altar at -z, then look up into the vault
  const hz = size.z / 2;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 400);
  const path = new CameraPath(
    [[0, 1.7, hz * 0.8], [0.3, 1.7, hz * 0.45], [0, 1.7, hz * 0.05], [-0.3, 1.65, -hz * 0.3], [0, 1.6, -hz * 0.45]],
    [[0, 4.5, -hz], [0, 5, -hz], [0, 6, -hz], [0, 8, -hz * 0.8], [0, 15, -hz * 0.35]],
  );

  return {
    scene, camera, exposure: 1.15,
    resize(aspect) { camera.aspect = aspect; camera.fov = aspect < 0.9 ? 78 : 62; camera.updateProjectionMatrix(); },
    update(t) { path.apply(camera, t); },
  };
}
