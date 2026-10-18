import * as THREE from 'three';
import { CameraPath, beamMatrix, dotTexture, makeSky, rng, sunLight } from './util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr, scanned, triplanar } from './textures.js';
import { loadEiffel } from './eiffel-model.js';

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
  const chords = [], plates = [], rivets = [];
  const detail = new THREE.Object3D();

  const hs = [...levels(0, H2, 6.4), ...levels(H2 + 8, 300, 8.4)];
  for (let i = 0; i < hs.length - 1; i++) {
    const A = rings(hs[i]), B = rings(hs[i + 1]);
    if (A.length !== B.length) continue;
    const upper = hs[i] > H2;
    const chord = upper ? 1.1 : 1.6, brace = upper ? 0.45 : 0.6;
    for (let k = 0; k < A.length; k++) {
      const ra = A[k], rb = B[k];
      const center = ra.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(0.25);
      for (let c = 0; c < 4; c++) {
        const c2 = (c + 1) % 4;
        chords.push(beamMatrix(ra[c], rb[c], chord).clone());
        add(ra[c], rb[c2], brace);
        add(ra[c2], rb[c], brace);
        if (i % 2 === 0) add(ra[c], ra[c2], brace * 0.8);
        const normal = ra[c].clone().sub(center).normalize();
        detail.position.copy(ra[c]).addScaledVector(normal, chord * 0.52);
        detail.rotation.set(0, Math.atan2(normal.x, normal.z), 0);
        detail.scale.set(chord * 1.1, chord * 1.6, 0.14);
        detail.updateMatrix();
        plates.push(detail.matrix.clone());
        for (const offset of [-0.43, 0.43]) {
          detail.position.copy(ra[c]).addScaledVector(normal, chord * 0.62);
          detail.position.y += offset * chord;
          detail.scale.setScalar(upper ? 0.1 : 0.14);
          detail.updateMatrix();
          rivets.push(detail.matrix.clone());
        }
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

  // ornamental arches between the legs
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const point = (angle, radius) => new THREE.Vector3(
      Math.sin(a) * 50 + Math.cos(a) * Math.cos(angle) * radius,
      1 + Math.sin(angle) * radius,
      Math.cos(a) * 50 - Math.sin(a) * Math.cos(angle) * radius,
    );
    for (let j = 0; j < 32; j++) {
      const t0 = j * Math.PI / 32, t1 = (j + 1) * Math.PI / 32;
      add(point(t0, 37), point(t1, 37), 0.65);
      add(point(t0, 40), point(t1, 40), 0.65);
      add(point(t0, 37), point(t0, 40), 0.28);
      add(point(t0, j % 2 ? 37 : 40), point(t1, j % 2 ? 40 : 37), 0.22);
    }
  }

  // platforms
  const deck = (h, half, t) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.65, half * 2), mat);
    d.position.y = h + t / 2 - 0.325;
    d.castShadow = true;
    g.add(d);
    for (let face = 0; face < 4; face++) {
      const a = face * Math.PI / 2;
      const point = (x, y) => new THREE.Vector3(
        Math.cos(a) * x + Math.sin(a) * half, y,
        -Math.sin(a) * x + Math.cos(a) * half,
      );
      const floor = h + t / 2;
      for (const y of [floor + 0.65, floor + 1.35]) add(point(-half, y), point(half, y), 0.13);
      for (const y of [h - t / 2, floor - 0.65]) add(point(-half, y), point(half, y), 0.45);
      const bays = Math.ceil(half * 2 / 3);
      for (let j = 0; j <= bays; j++) {
        const x = -half + j * half * 2 / bays;
        add(point(x, floor), point(x, floor + 1.35), 0.11);
        if (j < bays) {
          const next = -half + (j + 1) * half * 2 / bays;
          add(point(x, h - t / 2), point(next, floor - 0.65), 0.2);
          add(point(next, h - t / 2), point(x, floor - 0.65), 0.2);
        }
      }
    }
  };
  deck(57, w(57) + 4, 5);
  deck(H2, w(H2) + 2.5, 3.5);
  deck(276, w(276) + 1.6, 3);
  const flanges = [
    new THREE.BoxGeometry(1, 1, 0.18).translate(0, 0, -0.41),
    new THREE.BoxGeometry(1, 1, 0.18).translate(0, 0, 0.41),
    new THREE.BoxGeometry(0.18, 1, 0.64),
  ];
  const chordGeometry = mergeGeometries(flanges);
  flanges.forEach((geometry) => geometry.dispose());
  for (const [name, geometry, matrices] of [
    ['lattice-and-railings', new THREE.BoxGeometry(1, 1, 1), mats],
    ['flanged-chords', chordGeometry, chords],
    ['gusset-plates', new THREE.BoxGeometry(1, 1, 1), plates],
    ['rivet-heads', new THREE.OctahedronGeometry(1), rivets],
  ]) {
    const mesh = new THREE.InstancedMesh(geometry, mat, matrices.length);
    mesh.name = name;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = name !== 'rivet-heads';
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 20, 8), mat);
  lantern.position.y = 289;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.y = 299;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 32, 8), mat);
  antenna.position.y = 314;
  g.add(lantern, dome, antenna);
  return { group: g, beams: mats.length + chords.length };
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

export async function createEiffel(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(renderer, scene, {
    elevation: 1.2, azimuth: 248, turbidity: 9, rayleigh: 3.2, mie: 0.006, mieG: 0.86, clouds: 0.45, envIntensity: 0.55,
  });
  scene.fog = new THREE.FogExp2(0x9a7f8c, 0.00085);
  const light = sunLight(scene, sun, 0xff9b62, 2.2, 420, 900);
  light.target.position.set(0, 0, 100);
  scene.add(new THREE.HemisphereLight(0x8a9bd6, 0x2c2a2a, 0.5));

  const iron = new THREE.MeshStandardMaterial({
    ...pbr('rusty_painted_metal'), color: 0x8a7462,
    metalness: 0.55, roughness: 0.6, emissive: 0xffa04a, emissiveIntensity: 0.95,
  });
  // Approximate the installed uplights on iron only, without lighting the city or sky.
  iron.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float vTowerHeight;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 towerPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        towerPosition = instanceMatrix * towerPosition;
      #endif
      vTowerHeight = (modelMatrix * towerPosition).y;
    `);
    shader.fragmentShader = 'varying float vTowerHeight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      float underside = max(dot(normal, -upView), 0.0);
      float flood = exp(-abs(vTowerHeight - 12.0) / 32.0)
        + exp(-abs(vTowerHeight - 65.0) / 26.0)
        + exp(-abs(vTowerHeight - 123.0) / 44.0)
        + exp(-abs(vTowerHeight - 280.0) / 30.0);
      totalEmissiveRadiance *= (0.12 + 0.42 * flood + 0.65 * underside)
        * (0.55 + 0.45 * diffuseColor.r);
    `);
  };
  // painted puddle iron: a scanned painted-metal set, tinted Eiffel brown
  triplanar(iron, { scale: 0.6, normalScale: 0.8 });
  const tower = await loadEiffel(iron);
  scene.add(tower.group);

  const spark = sparkles(1600);
  scene.add(spark);

  // the two rotating beacon beams from the top
  const beamGeo = new THREE.ConeGeometry(10, 850, 24, 1, true);
  beamGeo.translate(0, -425, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vEye;
      void main() {
        vUv = uv;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vEye = -p.xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vEye;
      void main() {
        float edge = pow(abs(dot(normalize(vNormal), normalize(vEye))), 2.0);
        float fade = smoothstep(0.0, 0.65, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
        gl_FragColor = vec4(0.65, 0.78, 1.0, edge * fade * 0.035);
      }`,
  });
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
  const grass = scanned('leafy_grass', { color: 0x9aa884, roughness: 1 }, { scale: 0.3, macro: 0.6 });
  const gravel = scanned('gravel_floor', { color: 0xe8dcc6, roughness: 1 }, { scale: 0.4, macro: 0.4 });
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
  const facade = new THREE.MeshStandardMaterial({ color: 0xcfc1a6, roughness: 0.88, emissive: 0xffb36b, emissiveIntensity: 1 });
  facade.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vCityPos;
varying vec3 vCityNormal;
` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 cityPos = instanceMatrix * vec4(transformed, 1.0);
      vCityPos = (modelMatrix * cityPos).xyz;
      vCityNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
    `);
    shader.fragmentShader = `varying vec3 vCityPos;
varying vec3 vCityNormal;
float cityHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`
      + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float side = abs(vCityNormal.y) < 0.5 ? 1.0 : 0.0;
      float u = abs(vCityNormal.x) > abs(vCityNormal.z) ? vCityPos.z : vCityPos.x;
      vec2 cell = vec2(u / 3.6, (vCityPos.y - 1.5) / 3.2);
      vec2 f = fract(cell);
      float win = side * step(0.28, f.x) * step(f.x, 0.72) * step(0.25, f.y) * step(f.y, 0.82) * step(1.0, vCityPos.y);
      float lit = step(0.7, cityHash(floor(cell) + floor(vCityPos.xz / 40.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.1, 0.12), win);
      totalEmissiveRadiance *= win * lit * (0.6 + 0.4 * cityHash(floor(cell) * 1.7));
    `);
  };
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), facade, N);
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), scanned('grey_roof_tiles', { color: 0x9aa3ad, roughness: 0.7, metalness: 0.2 }, { scale: 0.25 }), N);
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
    scene, camera, exposure: 0.65,
    resize(aspect) { camera.aspect = aspect; camera.fov = aspect < 0.9 ? 66 : 50; camera.updateProjectionMatrix(); },
    update(t, time) {
      path.apply(camera, t);
      spark.material.uniforms.uTime.value = time;
      spark.material.uniforms.uScale.value = 900 * (window.innerHeight / 900);
      beacon.rotation.y = time * 0.35;
    },
  };
}
