import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildHeadset } from './headset.js';
import { dotTexture, easeIn, easeInOut, easeOut, lerp, range, rng } from './util.js';

const PLACES = {
  agra: { lat: 27.17, lon: 78.04 },
  paris: { lat: 48.86, lon: 2.29 },
  valloire: { lat: 45.17, lon: 6.43 },
  giza: { lat: 29.98, lon: 31.13 },
};

function latLon(lat, lon, r) {
  const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Wire globe connecting the three tour destinations. */
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
  // the core hides the far side, so it must draw before anything on the near side
  core.renderOrder = 1;
  grid.renderOrder = 2;
  g.add(core);

  const pinMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true });
  const pins = {};
  for (const [k, p] of Object.entries(PLACES)) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), pinMat);
    m.position.copy(latLon(p.lat, p.lon, R * 1.005));
    m.renderOrder = 2;
    g.add(m);
    pins[k] = m;
  }

  const arcMat = new THREE.LineDashedMaterial({ color: accent, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.9 });
  const arcs = [];
  for (const [from, to] of [['agra', 'paris'], ['paris', 'valloire'], ['valloire', 'giza'], ['giza', 'agra']]) {
    const a = pins[from].position.clone().normalize(), b = pins[to].position.clone().normalize();
    const ang = a.angleTo(b);
    const line = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const v = new THREE.Vector3().copy(a).lerp(b, t).normalize();
      line.push(v.multiplyScalar(R * (1.005 + Math.sin(Math.PI * t) * (0.03 + ang * 0.1))));
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), arcMat);
    l.renderOrder = 2;
    l.computeLineDistances();
    g.add(l);
    arcs.push(l);
  }
  // face the Mediterranean-to-India band toward the camera
  g.rotation.x = 0.32;
  return { group: g, grid, core, pins, arcMat, pinMat };
}

/** three.js's ACES filmic curve (exposure 1), so a background can be solved to land on the page colour. */
function aces(c) {
  const v = [c[0] / 0.6, c[1] / 0.6, c[2] / 0.6];
  const i = [
    0.59719 * v[0] + 0.35458 * v[1] + 0.04823 * v[2],
    0.076 * v[0] + 0.90834 * v[1] + 0.01566 * v[2],
    0.0284 * v[0] + 0.13383 * v[1] + 0.83777 * v[2],
  ];
  const f = i.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081));
  return [
    1.60475 * f[0] - 0.53108 * f[1] - 0.07367 * f[2],
    -0.10208 * f[0] + 1.10813 * f[1] - 0.00605 * f[2],
    -0.00327 * f[0] - 0.07276 * f[1] + 1.07602 * f[2],
  ].map((x) => Math.min(1, Math.max(0, x)));
}
function untoneMapped(hex) {
  const want = new THREE.Color(hex).toArray();
  const x = [...want];
  for (let n = 0; n < 40; n++) {
    const got = aces(x);
    for (let k = 0; k < 3; k++) x[k] *= Math.min(1.6, Math.max(0.6, want[k] / Math.max(got[k], 1e-4)));
  }
  return new THREE.Color(...x);
}
const THEMES = {
  dark: { bg: new THREE.Color(0x0a0b0e), grid: 0x8a8f9c, gridOpacity: 0.22, dust: 0.16, arc: 0xe59a76, arcOpacity: 0.9, land: 0xd7dbe4, landOpacity: 0.75, landSize: 0.03 },
  light: { bg: untoneMapped(0xf6f5f2), grid: 0xb9bac0, gridOpacity: 1, dust: 0.05, arc: 0xb0461f, arcOpacity: 1, land: 0x4a4b53, landOpacity: 1, landSize: 0.05 },
};

export function createStudio(renderer, accent) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b0e);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
  key.position.set(3, 4, 5);
  const top = new THREE.DirectionalLight(0xffffff, 1.2);
  top.position.set(-2, 6, 2);
  scene.add(top);
  const rim = new THREE.PointLight(accent, 40, 20, 2);
  rim.position.set(-3.5, 1.5, -2.5);
  const fill = new THREE.PointLight(0x7f9cff, 6, 20, 2);
  fill.position.set(3, -2, -2);
  scene.add(key, rim, fill);

  const headset = buildHeadset();
  scene.add(headset);

  const globe = buildGlobe(accent);
  scene.add(globe.group);
  // continents as a grid of square pixels, sampled from Natural Earth by scripts/land-dots.mjs
  const landMat = new THREE.PointsMaterial({ size: 0.03, color: 0xd7dbe4, transparent: true, opacity: 0.75, depthWrite: false });
  fetch('/data/land-dots.json').then((r) => r.json()).then((dots) => {
    const pos = new Float32Array(dots.length * 3);
    dots.forEach(([lat, lon], i) => latLon(lat, lon, 2.012).toArray(pos, i * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const land = new THREE.Points(geo, landMat);
    land.renderOrder = 2;
    globe.group.add(land);
  }).catch(() => {});

  // ambient dust in the light
  const r = rng(3), N = 420, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (r() - 0.5) * 16; pos[i * 3 + 1] = (r() - 0.5) * 9; pos[i * 3 + 2] = (r() - 0.5) * 10 - 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.018, map: dotTexture(), transparent: true, opacity: 0.16, depthWrite: false, color: 0xffe9d6,
  }));
  scene.add(dust);

  const _v = new THREE.Vector3();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let narrow = false;
  // the places' mean longitude; turning the globe by -(lon + 90 deg) brings a longitude to face the camera
  const lons = Object.values(PLACES).map((p) => THREE.MathUtils.degToRad(p.lon));
  const centre = Math.atan2(lons.reduce((a, l) => a + Math.sin(l), 0), lons.reduce((a, l) => a + Math.cos(l), 0));
  const facingCentre = -centre - Math.PI / 2;
  let spin = 0, lastTime = 0;

  let gridOpacity = THEMES.dark.gridOpacity, dustOpacity = THEMES.dark.dust, landOpacity = THEMES.dark.landOpacity, arcOpacity = THEMES.dark.arcOpacity;
  return {
    scene, camera, exposure: 1,
    pins: globe.pins,
    setTheme(name) {
      const t = THEMES[name] || THEMES.dark;
      scene.background.copy(t.bg);
      globe.core.material.color.copy(t.bg);
      globe.grid.material.color.set(t.grid);
      globe.arcMat.color.set(t.arc);
      landMat.color.set(t.land);
      landMat.size = t.landSize;
      landOpacity = t.landOpacity;
      arcOpacity = t.arcOpacity;
      globe.pinMat.color.set(t.arc);
      gridOpacity = t.gridOpacity;
      dustOpacity = t.dust;
    },
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
      const gx = narrow ? 0.08 : 1.42;
      globe.group.scale.setScalar(narrow ? 0.48 : 0.68);
      globe.group.position.set(lerp(gx, gx + 2.5, out), lerp(narrow ? -1.45 : -0.02, -0.6, out), lerp(0, -7, out));
      // drift slowly while the places face the viewer, hurry through the empty far side
      const dt = Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      if (!reducedMotion.matches) {
        const away = Math.abs(Math.atan2(Math.sin(spin), Math.cos(spin)));
        const hurry = THREE.MathUtils.smoothstep(away, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(105));
        spin += dt * THREE.MathUtils.lerp(0.14, 1.6, hurry);
      }
      globe.group.rotation.y = facingCentre + spin;
      const fade = 1 - out;
      globe.grid.material.opacity = gridOpacity * fade;
      landMat.opacity = landOpacity * fade;
      globe.core.material.opacity = 0.82 * fade;
      globe.arcMat.opacity = arcOpacity * fade;
      globe.pinMat.opacity = fade;
      globe.arcMat.dashOffset = -time * 0.12;
      globe.group.visible = fade > 0.001;

      // headset: enters from the left on an arc, turns, then comes to the eyes
      const fly = easeOut(range(p, 0.04, 0.17));
      const show = range(p, 0.17, 0.25);
      const turn = easeInOut(range(p, 0.25, 0.32));
      const wear = easeIn(range(p, 0.31, 0.37));
      const bob = Math.sin(time * 1.1) * 0.05 * (1 - wear);

      let x = lerp(-9, narrow ? 0 : 1.1, fly), y = lerp(1.6, narrow ? -0.6 : 0, fly) + Math.sin(Math.PI * fly) * 0.5, z = lerp(-3, 0, fly);
      let ry = lerp(-2.7, 0.85, fly), rx = lerp(0.4, 0.2, fly), rz = lerp(0.5, 0, fly);
      ry += lerp(0, -0.45, show);
      ry = lerp(ry, -Math.PI, turn);
      rx = lerp(rx, 0, turn);
      x = lerp(x, 0, turn);
      const s = narrow ? 0.72 : 1;
      z = lerp(z, 6.95, wear);
      y = lerp(y + bob, -0.04, wear);
      headset.position.set(x, y, z);
      headset.rotation.set(rx, ry, rz);
      headset.scale.setScalar(lerp(s, 1, wear));
      headset.visible = p > 0.035;
      // loosen and flip the strap up over the top before the headset goes on
      headset.userData.harness.rotation.x = lerp(0, 1.45, easeInOut(range(p, 0.235, 0.31)));


      dust.material.opacity = dustOpacity;
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
