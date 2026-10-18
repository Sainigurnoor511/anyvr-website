import * as THREE from 'three';
import { loadTaj } from './taj-model.js';
import { loadEiffel } from './eiffel-model.js';
import { placeScan } from './scans.js';
import { smooth, range } from './util.js';

async function pyramidsGroup() {
  const g = new THREE.Group();
  for (const [x, z, size] of [[0, 0, 1], [-125, -125, .85], [-225, -240, .55]]) {
    const placed = await placeScan('/models/menkaure.glb', { height: 146 * size, turn: Math.PI + size, shadows: false });
    if (placed) {
      placed.group.position.set(x, 0, z);
      g.add(placed.group);
      continue;
    }
    const geometry = new THREE.CylinderGeometry(0, 85 * size, 105 * size, 4);
    geometry.rotateY(Math.PI / 4);
    const pyramid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#cab08a', roughness: .9 }));
    pyramid.position.set(x, 52.5 * size, z);
    g.add(pyramid);
  }
  return g;
}

async function scanOrBox(url, height) {
  const placed = await placeScan(url, { height, shadows: false });
  if (placed) return placed.group;
  return new THREE.Mesh(new THREE.BoxGeometry(height, height, height), new THREE.MeshStandardMaterial({ color: '#555' }));
}

export async function createLobby(renderer, accent) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0b0e');
  scene.fog = new THREE.Fog('#0a0b0e', 18, 46);
  scene.add(new THREE.HemisphereLight('#e5ebff', '#4c4540', 2.1));
  const key = new THREE.DirectionalLight('#fff4e6', 4);
  key.position.set(-3, 8, 6);
  const fill = new THREE.DirectionalLight('#b3c8ed', 2);
  fill.position.set(6, 5, -4);
  scene.add(key, fill);

  const marble = new THREE.MeshStandardMaterial({ color: '#e7e1d5', roughness: .55 });
  const recess = new THREE.MeshStandardMaterial({ color: '#777069', roughness: .85, side: THREE.DoubleSide });
  const panel = new THREE.MeshStandardMaterial({ color: '#bcb4a8', roughness: .6, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: accent, roughness: .4, metalness: .45 });
  const [taj, tower, church, pyramids] = await Promise.all([
    loadTaj({ marble, recess, panel, gold }).then((r) => r.group),
    loadEiffel(new THREE.MeshStandardMaterial({ color: '#c3a482', metalness: .35, roughness: .45 })).then((r) => r.group),
    scanOrBox('/models/valloire.glb', 18),
    pyramidsGroup(),
  ]);
  const models = [taj, tower, church, pyramids];
  const SPACING = 3.3;
  const holders = [];
  for (const [i, model] of models.entries()) {
    const bounds = new THREE.Box3().setFromObject(model, true);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = Math.min(2.1 / Math.max(size.x, size.z), 2.6 / size.y);
    const center = bounds.getCenter(new THREE.Vector3());
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, .53 - bounds.min.y * scale, -center.z * scale);
    model.traverse((obj) => { if (obj.isMesh) { obj.castShadow = false; obj.receiveShadow = false; } });
    const holder = new THREE.Group();
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, .5, 64), new THREE.MeshStandardMaterial({ color: '#24262b', roughness: .35, metalness: .3 }));
    podium.position.y = .25;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.35, .009, 8, 96), new THREE.MeshBasicMaterial({ color: '#b2a395' }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = .5;
    holder.add(model, podium, rim);
    holders.push(holder);
    scene.add(holder);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#101115', roughness: .6, metalness: .1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.01;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(48, 1, .05, 100);
  let narrow = false;
  const eye = new THREE.Vector3();
  const target = new THREE.Vector3();
  const arc = (i, spacing) => {
    const a = (i - (holders.length - 1) / 2) * 0.36;
    return [Math.sin(a) * spacing * 3.1, Math.cos(a) * -spacing * 0.9 + spacing * 0.9];
  };
  function layout() {
    const spacing = narrow ? 2.2 : SPACING;
    holders.forEach((holder, i) => {
      const [x, z] = arc(i, spacing);
      holder.position.set(x, 0, z);
      holder.scale.setScalar(narrow ? .7 : 1);
    });
  }
  layout();
  return {
    scene, camera, exposure: .9,
    resize(aspect) {
      narrow = aspect < .9;
      camera.aspect = aspect;
      camera.fov = narrow ? 70 : 52;
      camera.updateProjectionMatrix();
      layout();
    },
    update(t, time) {
      const approach = smooth(range(t, .76, 1));
      const first = holders[0].position;
      eye.set(0, narrow ? 4.4 : 4, narrow ? 15 : 14);
      eye.lerp(new THREE.Vector3(first.x * .9, 2.2, first.z + 4.8), approach);
      target.set(0, 1.2, -1).lerp(new THREE.Vector3(first.x, 1.4, first.z), approach);
      camera.position.copy(eye);
      camera.lookAt(target);
      models.forEach((model, i) => { model.rotation.y = Math.sin(time * .15 + i) * .09; });
    },
  };
}
