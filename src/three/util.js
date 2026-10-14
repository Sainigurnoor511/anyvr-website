import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Maps p from [a, b] onto [0, 1], clamped. */
export const range = (p, a, b) => clamp((p - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;

/** Deterministic PRNG so the generated cities, trees and dunes look the same on every load. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 2D value noise, used for dunes. */
export function valueNoise(seed = 7) {
  const r = rng(seed), P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = r();
  const h = (x, y) => P[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 512];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  };
}

/** A camera move: one spline for the eye, one for what it looks at. */
export class CameraPath {
  constructor(eye, target) {
    this.eye = new THREE.CatmullRomCurve3(eye.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    this.target = new THREE.CatmullRomCurve3(target.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    this._t = new THREE.Vector3();
  }
  apply(camera, t) {
    t = clamp(t);
    this.eye.getPoint(t, camera.position);
    camera.lookAt(this.target.getPoint(t, this._t));
  }
}

/**
 * Physically based sky plus a matching sun light and a PMREM environment, so
 * marble, sandstone and iron all pick up the colour of that time of day.
 */
export function makeSky(renderer, scene, o) {
  const sky = new Sky();
  sky.scale.setScalar(12000);
  const u = sky.material.uniforms;
  u.turbidity.value = o.turbidity;
  u.rayleigh.value = o.rayleigh;
  u.mieCoefficient.value = o.mie;
  u.mieDirectionalG.value = o.mieG;
  if (u.cloudCoverage) {
    u.cloudCoverage.value = o.clouds ?? 0.3;
    u.cloudDensity.value = 0.35;
    u.cloudElevation.value = 0.55;
  }
  const sun = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(90 - o.elevation), THREE.MathUtils.degToRad(o.azimuth),
  );
  u.sunPosition.value.copy(sun);
  scene.add(sky);

  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0, 1, 20000).texture;
  scene.environmentIntensity = o.envIntensity ?? 0.6;
  pmrem.dispose();

  return { sky, sun };
}

export function sunLight(scene, sun, color, intensity, box = 200, dist = 600) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.copy(sun).multiplyScalar(dist);
  light.castShadow = true;
  const s = light.shadow;
  s.mapSize.set(2048, 2048);
  s.camera.left = -box; s.camera.right = box; s.camera.top = box; s.camera.bottom = -box;
  s.camera.near = 1; s.camera.far = dist * 2.5;
  s.bias = -0.0004;
  s.normalBias = 0.6;
  scene.add(light, light.target);
  return light;
}

/** Soft round sprite for point clouds (dust, sand, stars, sparkles). */
export function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Places a unit box (or any unit-Y geometry) as a beam from a to b inside an InstancedMesh. */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _mid = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export function beamMatrix(a, b, thickness) {
  _d.subVectors(b, a);
  const len = _d.length();
  _q.setFromUnitVectors(UP, _d.normalize());
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _s.set(thickness, len, thickness);
  return _m.compose(_mid, _q, _s);
}

/** Lathe profile for an onion dome: normalised [radius, height] pairs smoothed by a spline. */
export function onionDome(R, H, segments = 48, color, material) {
  const raw = [
    [0.0, 0.0], [1.0, 0.0], [1.07, 0.1], [1.13, 0.22], [1.12, 0.34], [1.04, 0.46], [0.9, 0.58],
    [0.7, 0.7], [0.47, 0.81], [0.26, 0.9], [0.11, 0.96], [0.03, 0.995], [0.0, 1.0],
  ];
  const curve = new THREE.SplineCurve(raw.slice(1).map(([r, h]) => new THREE.Vector2(r * R, h * H)));
  const pts = [new THREE.Vector2(0, 0), ...curve.getPoints(40)];
  pts[pts.length - 1].x = 0;
  const geo = new THREE.LatheGeometry(pts, segments);
  return new THREE.Mesh(geo, material ?? new THREE.MeshStandardMaterial({ color }));
}

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
  });
}
