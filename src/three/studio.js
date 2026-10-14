import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildHeadset } from './headset.js';
import { dotTexture, easeIn, easeInOut, easeOut, lerp, range, rng } from './util.js';

const PLACES = {
  home: { lat: 31.22, lon: 75.77 }, // Phagwara, where AnyVR was made
  agra: { lat: 27.17, lon: 78.04 },
  paris: { lat: 48.86, lon: 2.29 },
  giza: { lat: 29.98, lon: 31.13 },
};

function latLon(lat, lon, r) {
  const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Wire globe with the three destinations and arcs from home: the hero's "anywhere". */
function buildGlobe(accent) {
  const R = 2;
  const g = new THREE.Group();
  const pts = [];
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = 0; lon < 360; lon += 4) {
      pts.push(latLon(lat, lon, R), latLon(lat, lon + 4, R));
    }
  }
  for (let lon = 0; lon < 360; lon += 15) {
    for (let lat = -88; lat < 88; lat += 4) {
      pts.push(latLon(lat, lon, R), latLon(Math.min(lat + 4, 88), lon, R));
    }
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x8a8f9c, transparent: true, opacity: 0.22 }),
  );
  g.add(grid);

  // occluding core so the back of the grid recedes
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.985, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x0a0b0e, transparent: true, opacity: 0.82 }),
  );
  g.add(core);

  const pinMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true });
  const homeMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true });
  const pins = {};
  for (const [k, p] of Object.entries(PLACES)) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(k === 'home' ? 0.035 : 0.05, 16, 12), k === 'home' ? homeMat : pinMat);
    m.position.copy(latLon(p.lat, p.lon, R * 1.005));
    g.add(m);
    pins[k] = m;
  }

  const arcMat = new THREE.LineDashedMaterial({ color: accent, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.9 });
  const arcs = [];
  for (const k of ['agra', 'paris', 'giza']) {
    const a = pins.home.position.clone().normalize(), b = pins[k].position.clone().normalize();
    const ang = a.angleTo(b);
    const line = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const v = new THREE.Vector3().copy(a).lerp(b, t).normalize();
      line.push(v.multiplyScalar(R * (1.005 + Math.sin(Math.PI * t) * (0.08 + ang * 0.35))));
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), arcMat);
    l.computeLineDistances();
    g.add(l);
    arcs.push(l);
  }
  // face the Mediterranean-to-India band toward the camera
  g.rotation.y = THREE.MathUtils.degToRad(-130);
  g.rotation.x = 0.32;
  return { group: g, grid, core, pins, arcMat, pinMat, homeMat };
}

export function createStudio(renderer, accent) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b0e);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xfff1e2, 2.4);
  key.position.set(3, 4, 5);
  const rim = new THREE.PointLight(accent, 40, 20, 2);
  rim.position.set(-3.5, 1.5, -2.5);
  const fill = new THREE.PointLight(0x7f9cff, 6, 20, 2);
  fill.position.set(3, -2, -2);
  scene.add(key, rim, fill);

  const headset = buildHeadset(accent);
  scene.add(headset);

  const globe = buildGlobe(accent);
  scene.add(globe.group);

  // ambient dust in the light
  const r = rng(3), N = 420, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (r() - 0.5) * 16; pos[i * 3 + 1] = (r() - 0.5) * 9; pos[i * 3 + 2] = (r() - 0.5) * 10 - 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.035, map: dotTexture(), transparent: true, opacity: 0.45, depthWrite: false, color: 0xffe9d6,
  }));
  scene.add(dust);

  const _v = new THREE.Vector3();
  let narrow = false;

  return {
    scene, camera, exposure: 1,
    pins: globe.pins,
    resize(aspect) {
      camera.aspect = aspect;
      narrow = aspect < 0.9;
      camera.fov = narrow ? 42 : 30;
      camera.updateProjectionMatrix();
    },
    /** p is the whole-story progress; the studio owns 0 .. ~0.37. */
    update(p, time) {
      // globe: sits right of the hero copy, then recedes as the headset arrives
      const out = easeIn(range(p, 0.02, 0.12));
      const gx = narrow ? 0 : 2.35;
      globe.group.position.set(lerp(gx, gx + 2.5, out), lerp(narrow ? -1.2 : -0.1, -0.6, out), lerp(0, -7, out));
      globe.group.rotation.y = THREE.MathUtils.degToRad(-130) + Math.sin(time * 0.15) * 0.12 + p * 2;
      const fade = 1 - out;
      globe.grid.material.opacity = 0.22 * fade;
      globe.core.material.opacity = 0.82 * fade;
      globe.arcMat.opacity = 0.9 * fade;
      globe.pinMat.opacity = fade;
      globe.homeMat.opacity = fade;
      globe.arcMat.dashOffset = -time * 0.12;
      globe.group.visible = fade > 0.001;

      // headset: enters from the left on an arc, turns, then comes to the eyes
      const fly = easeOut(range(p, 0.04, 0.17));
      const show = range(p, 0.17, 0.25);
      const turn = easeInOut(range(p, 0.25, 0.32));
      const wear = easeIn(range(p, 0.31, 0.37));
      const bob = Math.sin(time * 1.1) * 0.05 * (1 - wear);

      let x = lerp(-9, 0, fly), y = lerp(1.6, 0, fly) + Math.sin(Math.PI * fly) * 0.5, z = lerp(-3, 0, fly);
      let ry = lerp(-2.7, 0.55, fly), rx = lerp(0.4, 0.12, fly), rz = lerp(0.5, 0, fly);
      ry += lerp(0, -1.05, show);
      ry = lerp(ry, -Math.PI, turn);
      rx = lerp(rx, 0, turn);
      const s = narrow ? 0.72 : 1;
      z = lerp(z, 6.95, wear);
      y = lerp(y + bob, -0.04, wear);
      headset.position.set(x, y, z);
      headset.rotation.set(rx, ry, rz);
      headset.scale.setScalar(lerp(s, 1, wear));
      headset.visible = p > 0.035;

      dust.rotation.y = time * 0.01;
      dust.position.y = Math.sin(time * 0.2) * 0.1;
    },
    /** Screen position (0..1) of a globe pin, for the DOM labels. */
    project(key) {
      _v.copy(globe.pins[key].position);
      globe.group.localToWorld(_v);
      const facing = _v.clone().sub(globe.group.position).normalize().dot(_v.clone().sub(camera.position).normalize().negate()) > 0.1;
      _v.project(camera);
      return { x: (_v.x + 1) / 2, y: (1 - _v.y) / 2, visible: facing && globe.group.visible };
    },
  };
}
