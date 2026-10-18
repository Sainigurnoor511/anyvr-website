import * as THREE from 'three';
import { CameraPath, dotTexture, makeSky, rng, sunLight, valueNoise } from './util.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scanned } from './textures.js';
import { placeScan } from './scans.js';

/**
 * Giza plateau in the afternoon: Khufu, Khafre (still wearing a cap of its
 * original casing) and Menkaure at real base and height, the queens'
 * pyramids, a sphinx, and dunes rolling off to the horizon.
 */
/** A square pyramid (or frustum) aligned to the axes. */
function pyramid(base, height, mat, topBase = 0, stepped = true) {
  if (stepped) {
    const positions = [], uvs = [], colors = [], normals = [];
    const random = rng(Math.round(base * 13));
    const count = Math.ceil(height / 1.1), rise = height / count;
    const corners = (half, y) => [[half, y, -half], [-half, y, -half], [-half, y, half], [half, y, half]];
    const slope = (base - topBase) / (2 * height);
    const faceNormals = [[0, slope, -1], [-1, slope, 0], [0, slope, 1], [1, slope, 0]]
      .map((n) => new THREE.Vector3(...n).normalize().toArray());
    const quad = (a, b, c, d, uv, shade, normal = [0, 1, 0]) => {
      const points = [a, b, c, d];
      for (const index of [0, 1, 2, 0, 2, 3]) {
        positions.push(...points[index]);
        uvs.push(...uv[index]);
        colors.push(shade, shade, shade);
        normals.push(...normal);
      }
    };
    let half = base / 2;
    for (let row = 0; row < count; row++) {
      const y = row * rise, top = (row + 1) * rise;
      const next = row === count - 1 ? topBase / 2
        : THREE.MathUtils.lerp(base / 2, topBase / 2, (row + 1) / count) - random() * 0.025;
      const bottomRing = corners(half, y), outerRing = corners(next + (half - next) * 0.35, top), innerRing = corners(next, top);
      // courses vary in tone; the lowest ones are stained by wind-blown sand
      const stain = THREE.MathUtils.smoothstep(y / height, 0, 0.12);
      const shade = (0.8 + random() * 0.16) * (0.82 + 0.18 * stain);
      for (let face = 0; face < 4; face++) {
        const j = (face + 1) % 4;
        // risers lean out, treads face mostly up: the steps catch the low sun
        const fn = faceNormals[face];
        const riser = new THREE.Vector3(fn[0], fn[1] * 0.25, fn[2]).normalize().toArray();
        const tread = new THREE.Vector3(fn[0] * 0.45, 1, fn[2] * 0.45).normalize().toArray();
        quad(bottomRing[face], bottomRing[j], outerRing[j], outerRing[face],
          [[0, y / 3], [half * 2 / 4, y / 3], [half * 2 / 4, top / 3], [0, top / 3]], shade, riser);
        quad(outerRing[face], outerRing[j], innerRing[j], innerRing[face],
          [outerRing[face], outerRing[j], innerRing[j], innerRing[face]].map(([x, , z]) => [x / 4, z / 4]), shade * 1.06, tread);
      }
      half = next;
    }
    if (topBase > 0) {
      const top = corners(topBase / 2, height);
      quad(...top, top.map(([x, , z]) => [x / 4, z / 4]), 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // Slope normals keep subpixel ledges from flashing as bright horizontal stripes.
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = `stone-courses-${count}`;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  const R = base / Math.SQRT2;
  const geo = new THREE.CylinderGeometry(topBase / Math.SQRT2, R, height, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, height / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function sphinx(mat) {
  const g = new THREE.Group();
  const parts = [];
  const ellipsoid = (x, y, z, sx, sy, sz, segments = 16) => {
    const geometry = new THREE.SphereGeometry(1, segments, 12);
    geometry.scale(sx, sy, sz);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };
  ellipsoid(-2, 5.7, 0, 24, 6.7, 7.3, 24);
  ellipsoid(-17, 5.5, 0, 9, 7.2, 7.7);
  ellipsoid(17, 8.5, 0, 7, 7.5, 6.6);
  for (const side of [-1, 1]) {
    ellipsoid(26, 2, side * 4.3, 12, 2.5, 2.7);
    ellipsoid(33.5, 1.7, side * 4.3, 4.8, 1.9, 3);
    for (let toe = -1; toe <= 1; toe++) ellipsoid(37, 1.5, side * 4.3 + toe * 1.25, 1.6, 1.25, 0.62, 8);
  }
  ellipsoid(19.5, 16, 0, 3.5, 3.8, 3.6);
  const headProfile = new THREE.SplineCurve([
    [2.1, 0], [2.6, 0.7], [3.1, 2], [3.45, 4], [3.4, 6.2], [2.8, 7.2], [0, 7.6],
  ].map(([r, y]) => new THREE.Vector2(r, y)));
  const head = new THREE.LatheGeometry(headProfile.getPoints(28), 24);
  const hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i), z = hp.getZ(i);
    let x = hp.getX(i) * 0.85;
    const front = THREE.MathUtils.smoothstep(x, 1, 2.2);
    const sockets = Math.exp(-Math.pow((y - 4.4) / 0.4, 2) - Math.pow((Math.abs(z) - 1.2) / 0.65, 2));
    const mouth = Math.exp(-Math.pow((y - 2.1) / 0.18, 2) - z * z / 1.7);
    const noseBreak = Math.exp(-Math.pow((y - 3.8) / 0.8, 2) - z * z / 0.18);
    x = Math.min(x, 2.35) + front * (-0.35 * sockets - 0.12 * mouth + 0.16 * noseBreak);
    hp.setX(i, x);
  }
  head.computeVertexNormals();
  head.translate(20.5, 17, 0);
  parts.push(head);
  for (const side of [-1, 1]) {
    const flap = new THREE.Shape();
    flap.moveTo(side * 2.6, 23.6);
    flap.lineTo(side * 4.1, 22);
    flap.lineTo(side * 6, 14.5);
    flap.lineTo(side * 3.1, 15.2);
    flap.closePath();
    const nemes = new THREE.ExtrudeGeometry(flap, {
      depth: 4.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.2, bevelSegments: 1,
    });
    nemes.rotateY(Math.PI / 2);
    nemes.translate(17, 0, 0);
    parts.push(mergeVertices(nemes));
    nemes.dispose();
  }
  const crown = new THREE.LatheGeometry([
    [3.8, 0], [3.9, 0.4], [3.4, 1], [2.5, 1.4], [0, 1.6],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  crown.scale(0.95, 1, 1.02);
  crown.translate(19.5, 23.1, 0);
  parts.push(crown);
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  const body = new THREE.Mesh(geometry, mat);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  return g;
}

function sandDrift(count) {
  const r = rng(4);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(r() - 0.5) * 900, r() * 18, (r() - 0.5) * 900], i * 3);
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMap: { value: dotTexture() }, uCenter: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float uTime; uniform vec3 uCenter; varying float vA;
      void main() {
        vec3 p = position;
        p.x = mod(p.x + uTime * (14.0 + seed * 10.0) - uCenter.x + 450.0, 900.0) - 450.0 + uCenter.x;
        p.z = mod(p.z - uCenter.z + 450.0, 900.0) - 450.0 + uCenter.z;
        p.y += sin(uTime * 0.8 + seed * 40.0) * 1.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = 0.5 * smoothstep(400.0, 30.0, -mv.z);
        gl_PointSize = 160.0 * (0.4 + seed) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vA;
      void main() { gl_FragColor = vec4(vec3(1.0, 0.86, 0.62), vA * texture2D(uMap, gl_PointCoord).a); }`,
  });
  return new THREE.Points(geo, mat);
}

export async function createGiza(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(renderer, scene, {
    elevation: 18, azimuth: 125, turbidity: 7, rayleigh: 1.3, mie: 0.006, mieG: 0.8, clouds: 0.08, envIntensity: 0.45,
  });
  scene.fog = new THREE.FogExp2(0xd8b48a, 0.00055);
  const light = sunLight(scene, sun, 0xffd4a0, 3.4, 800, 1600);
  light.target.position.set(-200, 0, -250);
  light.shadow.camera.left = light.shadow.camera.bottom = -650;
  light.shadow.camera.right = light.shadow.camera.top = 650;
  light.shadow.camera.near = 300;
  light.shadow.camera.far = 2700;
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = -0.00035;
  light.shadow.normalBias = 1;
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0xd9aa72, 1.1));

  // weathered limestone courses and the smooth Tura casing left on Khafre's cap
  const stone = scanned('old_sandstone_02', { color: 0xfff1df, roughness: 1, vertexColors: true }, { scale: 0.32, macro: 0.35, normalScale: 1.3, saturation: 0.55, gain: 1.25 });
  const casing = scanned('sandstone_cracks', { color: 0xfff1dd, roughness: 0.9 }, { scale: 0.2, normalScale: 0.6 });

  const MENKAURE = '/models/menkaure.glb';
  const scanAt = async (height, x, y, z, turn) => {
    const placed = await placeScan(MENKAURE, { height, turn });
    if (!placed) return null;
    placed.group.position.set(x, y, z);
    scene.add(placed.group);
    return placed.group;
  };
  const scanned3 = await Promise.all([
    scanAt(146, 0, 0, 0, Math.PI),
    scanAt(136, -300, 10, -330, Math.PI / 2),
    scanAt(65, -520, 0, -660, 0),
  ]);
  if (scanned3.every(Boolean)) {
    await Promise.all([
      ...[-70, 0, 70].map((z, i) => scanAt(29, 175, 0, z, i * 1.3 + 0.6)),
      ...[-430, -470, -510].map((x, i) => scanAt(22, x, 0, -770, i * 0.9 + 2.1)),
    ]);
  } else {
    // procedural fallback when the scan is missing
    scanned3.forEach((g) => g && scene.remove(g));
    const khufu = pyramid(230, 146, stone);
    const khafre = new THREE.Group();
    khafre.add(pyramid(215, 136 * 0.8, stone, 215 * 0.2));
    const cap = pyramid(215 * 0.2, 136 * 0.2, casing, 0, false);
    cap.position.y = 136 * 0.8;
    khafre.add(cap);
    khafre.position.set(-300, 10, -330);
    const menkaure = pyramid(103, 65, stone);
    menkaure.position.set(-520, 0, -660);
    scene.add(khufu, khafre, menkaure);
    for (const z of [-70, 0, 70]) {
      const q = pyramid(46, 29, stone);
      q.position.set(175, 0, z);
      scene.add(q);
    }
    for (const x of [-430, -470, -510]) {
      const q = pyramid(40, 22, stone);
      q.position.set(x, 0, -770);
      scene.add(q);
    }
  }
  const sph = sphinx(scanned('sandstone_cracks', { color: 0xf3d6b0, roughness: 1 }, { scale: 0.18, normalScale: 1.5 }));
  sph.position.set(160, 0, 230);
  sph.rotation.y = 0.15;
  scene.add(sph);

  // dunes, flattened under the plateau
  const noise = valueNoise(17);
  const geo = new THREE.PlaneGeometry(9000, 9000, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const d = Math.hypot(x + 220, z + 260);
    const flat = THREE.MathUtils.smoothstep(d, 700, 1400);
    const h = (noise(x / 420, z / 420) * 60 + noise(x / 120, z / 120) * 12 + noise(x / 40, z / 40) * 2.5) * flat
      + noise(x / 60, z / 60) * 1.4;
    p.setY(i, h - 2);
  }
  geo.computeVertexNormals();
  const sand = new THREE.Mesh(geo, scanned('sand_01', { color: 0xffe2bd, roughness: 1 }, { scale: 0.09, macro: 0.8, normalScale: 0.7, saturation: 0.6, gain: 1.3 }));
  sand.receiveShadow = true;
  scene.add(sand);

  const drift = sandDrift(2200);
  scene.add(drift);

  const camera = new THREE.PerspectiveCamera(48, 1, 1, 30000);
  const path = new CameraPath(
    [[360, 7, 560], [250, 16, 360], [270, 46, 150], [460, 105, -180], [600, 170, -520]],
    [[0, 70, 0], [0, 62, 0], [-80, 55, -140], [-250, 45, -340], [-320, 40, -420]],
  );

  return {
    scene, camera, exposure: 0.46,
    resize(aspect) { camera.aspect = aspect; camera.fov = aspect < 0.9 ? 64 : 48; camera.updateProjectionMatrix(); },
    update(t, time) {
      path.apply(camera, t);
      drift.material.uniforms.uTime.value = time;
      drift.material.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
    },
  };
}
