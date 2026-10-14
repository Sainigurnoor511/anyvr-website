import * as THREE from 'three';
import { CameraPath, beamMatrix, dotTexture, makeSky, rng, sunLight } from './util.js';

/**
 * The Eiffel Tower as an iron lattice: four legs that curve inward and merge
 * at the second floor, every chord, diagonal and tie placed as an instanced
 * beam. Half-width follows w(h) = 60 e^(-h/93) + 2.5, which lands within a
 * metre or two of the real tower at each platform.
 */
const H2 = 115;
const w = (h) => 60 * Math.exp(-h / 93) + 2.5;
const legSize = (h) => Math.min(w(h), 25 + (w(H2) - 25) * (h / H2));

function levels(a, b, step) {
  const out = [];
  for (let h = a; h < b - 0.01; h += step) out.push(h);
  out.push(b);
  return out;
}

/** The corners of each lattice ring at height h, grouped into the faces that get bracing. */
function rings(h) {
  const W = w(h);
  if (h <= H2) {
    const s = legSize(h);
    const legs = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      legs.push([
        new THREE.Vector3(sx * W, h, sz * W),
        new THREE.Vector3(sx * (W - s), h, sz * W),
        new THREE.Vector3(sx * (W - s), h, sz * (W - s)),
        new THREE.Vector3(sx * W, h, sz * (W - s)),
      ]);
    }
    return legs;
  }
  return [[
    new THREE.Vector3(W, h, W), new THREE.Vector3(-W, h, W), new THREE.Vector3(-W, h, -W), new THREE.Vector3(W, h, -W),
  ]];
}

export function buildEiffel(mat) {
  const g = new THREE.Group();
  const mats = [];
  const add = (a, b, t) => mats.push(beamMatrix(a, b, t).clone());

  const hs = [...levels(0, H2, 6.4), ...levels(H2 + 8, 300, 8.4)];
  for (let i = 0; i < hs.length - 1; i++) {
    const A = rings(hs[i]), B = rings(hs[i + 1]);
    if (A.length !== B.length) continue;
    const upper = hs[i] > H2;
    const chord = upper ? 1.1 : 1.6, brace = upper ? 0.45 : 0.6;
    for (let k = 0; k < A.length; k++) {
      const ra = A[k], rb = B[k];
      for (let c = 0; c < 4; c++) {
        const c2 = (c + 1) % 4;
        add(ra[c], rb[c], chord);
        add(ra[c], rb[c2], brace);
        add(ra[c2], rb[c], brace);
        if (i % 2 === 0) add(ra[c], ra[c2], brace * 0.8);
      }
    }
  }
  // the transition at the second floor: legs into one shaft
  const cap = rings(H2 + 8)[0];
  for (const leg of rings(H2)) {
    const o = leg[0];
    const c = cap.find((q) => Math.sign(q.x) === Math.sign(o.x) && Math.sign(q.z) === Math.sign(o.z));
    add(o, c, 1.4);
    add(leg[1], c, 0.6);
    add(leg[3], c, 0.6);
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const lattice = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => lattice.setMatrixAt(i, m));
  lattice.castShadow = true;
  g.add(lattice);

  // ornamental arches between the legs
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(37, 1.3, 6, 48, Math.PI), mat);
    arch.scale.set(1, 1.02, 1);
    arch.position.set(Math.sin(a) * 50, 1, Math.cos(a) * 50);
    arch.rotation.y = a;
    arch.rotation.x = -0.12;
    g.add(arch);
  }

  // platforms
  const deck = (h, half, t) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(half * 2, t, half * 2), mat);
    d.position.y = h;
    d.castShadow = true;
    g.add(d);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 2, 1.2, half * 2 + 2), mat);
    rail.position.y = h + t / 2 + 0.6;
    rail.scale.set(1, 1, 1);
    g.add(rail);
  };
  deck(57, w(57) + 4, 5);
  deck(H2, w(H2) + 2.5, 3.5);
  deck(276, w(276) + 1.6, 3);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 20, 8), mat);
  lantern.position.y = 289;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.y = 299;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 32, 8), mat);
  antenna.position.y = 314;
  g.add(lantern, dome, antenna);
  return { group: g, beams: mats.length };
}

/** Twinkling bulbs scattered over the lattice, like the tower's hourly sparkle. */
function sparkles(count) {
  const r = rng(5);
  const pos = new Float32Array(count * 3), phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const h = Math.pow(r(), 1.25) * 300;
    const W = w(h), side = Math.floor(r() * 4), t = r() * 2 - 1;
    const p = [[W, t * W], [-W, t * W], [t * W, W], [t * W, -W]][side];
    if (h < H2 && Math.abs(t) * W < W - legSize(h)) { i--; continue; }
    pos.set([p[0], h, p[1]], i * 3);
    phase[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMap: { value: dotTexture() }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float phase; uniform float uTime; uniform float uScale; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = fract(phase + uTime * (0.6 + fract(phase * 7.13) * 0.9));
        vA = smoothstep(0.82, 1.0, tw) * 1.0 + 0.08;
        gl_PointSize = uScale * (0.9 + vA) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vA;
      void main() { gl_FragColor = vec4(vec3(4.0, 3.4, 2.4) * vA, 1.0) * texture2D(uMap, gl_PointCoord).a; }`,
  });
  return new THREE.Points(geo, mat);
}

export function createEiffel(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(renderer, scene, {
    elevation: 1.2, azimuth: 248, turbidity: 9, rayleigh: 3.2, mie: 0.006, mieG: 0.86, clouds: 0.45, envIntensity: 0.55,
  });
  scene.fog = new THREE.FogExp2(0x9a7f8c, 0.00085);
  const light = sunLight(scene, sun, 0xff9b62, 2.2, 420, 900);
  light.target.position.set(0, 0, 100);
  scene.add(new THREE.HemisphereLight(0x8a9bd6, 0x2c2a2a, 0.5));

  const iron = new THREE.MeshStandardMaterial({
    color: 0x6b4c34, metalness: 0.55, roughness: 0.5, emissive: 0xff8a3c, emissiveIntensity: 0.18,
  });
  const tower = buildEiffel(iron);
  scene.add(tower.group);

  const spark = sparkles(1600);
  scene.add(spark);

  // the two rotating beacon beams from the top
  const beamGeo = new THREE.ConeGeometry(16, 1400, 24, 1, true);
  beamGeo.translate(0, -700, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beacon = new THREE.Group();
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat);
  b2.rotation.y = Math.PI;
  beacon.add(b1, b2);
  beacon.position.y = 296;
  scene.add(beacon);

  // Champ de Mars lawns and gravel paths, then the city around them
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x5b5148, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const grass = new THREE.MeshStandardMaterial({ color: 0x3f5634, roughness: 1 });
  const gravel = new THREE.MeshStandardMaterial({ color: 0xb4a184, roughness: 1 });
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(220, 0.2, 220), gravel);
  plaza.position.y = 0.1;
  scene.add(ground, plaza);
  for (const sx of [-1, 1]) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(70, 0.4, 700), grass);
    lawn.position.set(sx * 50, 0.2, 470);
    lawn.receiveShadow = true;
    scene.add(lawn);
  }

  const r = rng(21), o = new THREE.Object3D();
  const N = 1400;
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd1c3a8, roughness: 0.9 }), N);
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.6, metalness: 0.3 }), N);
  let n = 0;
  while (n < N) {
    const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000;
    if (Math.abs(x) < 140 && z > -160) continue; // keep the Champ de Mars open
    if (Math.hypot(x, z) < 170) continue;
    const bw = 24 + r() * 40, bd = 18 + r() * 30, bh = 17 + r() * 9;
    o.position.set(x, bh / 2, z);
    o.rotation.y = (r() < 0.5 ? 0 : 0.6) + (r() - 0.5) * 0.08;
    o.scale.set(bw, bh, bd);
    o.updateMatrix();
    city.setMatrixAt(n, o.matrix);
    o.position.y = bh + 2.5;
    o.scale.set(bw * 0.92, 5, bd * 0.86);
    o.updateMatrix();
    roofs.setMatrixAt(n, o.matrix);
    n++;
  }
  city.castShadow = roofs.castShadow = true;
  city.receiveShadow = true;
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x2f4329, roughness: 1, flatShading: true }), 220);
  for (let i = 0; i < 220; i++) {
    const side = i % 2 ? -1 : 1, s = 5 + r() * 2.5;
    o.position.set(side * (95 + r() * 30), s, 140 + (i / 2) * 6.5 + r() * 3);
    o.rotation.set(0, r() * 6, 0);
    o.scale.set(s, s * 1.15, s);
    o.updateMatrix();
    trees.setMatrixAt(i, o.matrix);
  }
  trees.castShadow = true;
  scene.add(city, roofs, trees);

  const camera = new THREE.PerspectiveCamera(50, 1, 1, 30000);
  const path = new CameraPath(
    [[30, 30, 780], [40, 42, 520], [44, 30, 290], [24, 11, 120], [5, 4.5, 30]],
    [[0, 170, 0], [0, 160, 0], [0, 150, 0], [0, 160, 0], [0, 300, -6]],
  );

  return {
    scene, camera, exposure: 0.5,
    resize(aspect) { camera.aspect = aspect; camera.fov = aspect < 0.9 ? 66 : 50; camera.updateProjectionMatrix(); },
    update(t, time) {
      path.apply(camera, t);
      spark.material.uniforms.uTime.value = time;
      spark.material.uniforms.uScale.value = 900 * (window.innerHeight / 900);
      beacon.rotation.y = time * 0.35;
    },
  };
}
