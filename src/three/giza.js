import * as THREE from 'three';
import { CameraPath, dotTexture, makeSky, rng, sunLight, valueNoise } from './util.js';

/**
 * Giza plateau in the afternoon: Khufu, Khafre (still wearing a cap of its
 * original casing) and Menkaure at real base and height, the queens'
 * pyramids, a sphinx, and dunes rolling off to the horizon.
 */
function courseTexture(base, line) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 1024);
  const r = rng(9);
  for (let y = 0; y < 1024; y += 8) {
    g.fillStyle = line;
    g.globalAlpha = 0.35 + r() * 0.3;
    g.fillRect(0, y, 128, 1.5);
    for (let x = 0; x < 128; x += 6 + r() * 14) {
      g.globalAlpha = 0.15 + r() * 0.2;
      g.fillRect(x, y, 1, 8);
    }
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    g.fillRect(r() * 128, r() * 1024, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A square pyramid (or frustum) aligned to the axes. */
function pyramid(base, height, mat, topBase = 0) {
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
  const box = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  box(46, 11, 13, 0, 5.5, 0);          // body
  box(16, 13, 14, -16, 6.5, 0);         // haunch
  box(20, 3.5, 4, 27, 1.75, -4);        // paws
  box(20, 3.5, 4, 27, 1.75, 4);
  box(10, 9, 12, 19, 13, 0);            // chest
  const head = box(7, 8, 7, 22, 20, 0); // head
  const nemes = new THREE.Mesh(new THREE.CylinderGeometry(3, 6.5, 9, 4), mat);
  nemes.rotation.y = Math.PI / 4;
  nemes.position.set(20, 18.5, 0);
  g.add(nemes);
  head.scale.set(1, 1, 1);
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

export function createGiza(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(renderer, scene, {
    elevation: 13, azimuth: 215, turbidity: 7, rayleigh: 1.3, mie: 0.006, mieG: 0.8, clouds: 0.08, envIntensity: 0.65,
  });
  scene.fog = new THREE.FogExp2(0xdcb88a, 0.00042);
  const light = sunLight(scene, sun, 0xffd4a0, 3.4, 800, 1600);
  light.target.position.set(-200, 0, -250);
  scene.add(new THREE.HemisphereLight(0xaed0ff, 0xc79a62, 0.6));

  const stone = new THREE.MeshStandardMaterial({ map: courseTexture('#c9a774', '#7e6343'), roughness: 0.95, flatShading: true });
  const casing = new THREE.MeshStandardMaterial({ color: 0xe9d9b8, roughness: 0.7, flatShading: true });

  const khufu = pyramid(230, 146, stone);
  const khafre = new THREE.Group();
  khafre.add(pyramid(215, 136 * 0.8, stone, 215 * 0.2));
  const cap = pyramid(215 * 0.2, 136 * 0.2, casing);
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
  const sph = sphinx(new THREE.MeshStandardMaterial({ color: 0xc49a66, roughness: 1, flatShading: true }));
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
  const sand = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd7ad70, roughness: 1 }));
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
    scene, camera, exposure: 0.48,
    resize(aspect) { camera.aspect = aspect; camera.fov = aspect < 0.9 ? 64 : 48; camera.updateProjectionMatrix(); },
    update(t, time) {
      path.apply(camera, t);
      drift.material.uniforms.uTime.value = time;
      drift.material.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
    },
  };
}
