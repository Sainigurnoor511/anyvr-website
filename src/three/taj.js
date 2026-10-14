import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { CameraPath, makeSky, onionDome, rng, sunLight } from './util.js';

/**
 * The Taj Mahal at roughly real scale (metres): a 95 m plinth, a chamfered
 * 56 m mausoleum with a pishtaq (great arch) on each face, the onion dome on
 * its drum, four chhatris, and four minarets at the plinth corners.
 */
const S = 56, C = 8, PLINTH = 6.7, WALL = 30;

function pointedArch(w, h) {
  const s = new THREE.Shape(), hs = h - w * 0.62;
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, hs);
  s.quadraticCurveTo(-w / 2, h - w * 0.12, 0, h);
  s.quadraticCurveTo(w / 2, h - w * 0.12, w / 2, hs);
  s.lineTo(w / 2, 0);
  return new THREE.ShapeGeometry(s, 10);
}

function faceFrames() {
  // [normal angle, center x, center z, width] for the 4 straight faces and 4 chamfers
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    out.push({ kind: 'main', a, x: Math.sin(a) * (S / 2), z: Math.cos(a) * (S / 2) });
    // the chamfer face sits at distance (S - C) / sqrt(2) along its 45 degree normal
    const b = a + Math.PI / 4, d = (S - C) / Math.SQRT2;
    out.push({ kind: 'chamfer', a: b, x: Math.sin(b) * d, z: Math.cos(b) * d });
  }
  return out;
}

function placeOnFace(mesh, f, along, y, out) {
  // along: offset along the face (right-hand), out: offset along the normal
  const nx = Math.sin(f.a), nz = Math.cos(f.a);
  mesh.position.set(f.x + nz * along + nx * out, y, f.z - nx * along + nz * out);
  mesh.rotation.y = f.a;
  return mesh;
}

export function buildTaj(mats) {
  const { marble, recess, panel, gold } = mats;
  const g = new THREE.Group();

  // plinth with its blind arcade
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(95, PLINTH, 95), marble);
  plinth.position.y = PLINTH / 2;
  g.add(plinth);
  const smallArch = pointedArch(3.2, 4.4);
  const arcade = new THREE.InstancedMesh(smallArch, recess, 4 * 17);
  const m = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    for (let j = 0; j < 17; j++) {
      const along = -42 + j * 5.25;
      if (Math.abs(along) < 4) { m.scale.setScalar(0); } else { m.scale.setScalar(1); }
      m.position.set(Math.sin(a) * 47.56 + Math.cos(a) * along, 1.1, Math.cos(a) * 47.56 - Math.sin(a) * along);
      m.rotation.set(0, a, 0);
      m.updateMatrix();
      arcade.setMatrixAt(k++, m.matrix);
    }
  }
  g.add(arcade);

  // chamfered mausoleum body
  const shape = new THREE.Shape();
  const h = S / 2, e = S / 2 - C;
  [[-e, -h], [e, -h], [h, -e], [h, e], [e, h], [-e, h], [-h, e], [-h, -e]].forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: WALL, bevelEnabled: false });
  bodyGeo.rotateX(-Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, marble);
  body.position.y = PLINTH;
  g.add(body);

  // parapet
  const parapet = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }), panel);
  parapet.geometry.rotateX(-Math.PI / 2);
  parapet.scale.set(1.01, 1, 1.01);
  parapet.position.y = PLINTH + WALL;
  g.add(parapet);

  const faces = faceFrames();
  const bigArch = pointedArch(13.5, 24);
  const sideArch = pointedArch(6, 10.5);
  const chamArch = pointedArch(6.6, 10.5);
  const pinnacle = new THREE.CylinderGeometry(0.45, 0.55, 7, 8);
  const pinTop = new THREE.ConeGeometry(0.75, 1.6, 8);
  for (const f of faces) {
    if (f.kind === 'main') {
      const pish = new THREE.Mesh(new THREE.BoxGeometry(22, 35, 1.8), marble);
      g.add(placeOnFace(pish, f, 0, PLINTH + 17.5, 0.5));
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(17, 28.5), panel);
      g.add(placeOnFace(frame, f, 0, PLINTH + 15, 1.42));
      const arch = new THREE.Mesh(bigArch, recess);
      g.add(placeOnFace(arch, f, 0, PLINTH + 0.6, 1.45));
      for (const s of [-1, 1]) {
        for (const y of [PLINTH + 1.5, PLINTH + 15.5]) {
          g.add(placeOnFace(new THREE.Mesh(sideArch, recess), f, s * 15.6, y, 0.05));
        }
        // guldastas framing the pishtaq
        g.add(placeOnFace(new THREE.Mesh(pinnacle, marble), f, s * 11.2, PLINTH + 38, 0.6));
        g.add(placeOnFace(new THREE.Mesh(pinTop, marble), f, s * 11.2, PLINTH + 42.2, 0.6));
      }
    } else {
      for (const y of [PLINTH + 1.5, PLINTH + 15.5]) {
        g.add(placeOnFace(new THREE.Mesh(chamArch, recess), f, 0, y, 0.05));
      }
    }
  }

  // chhatris on the roof corners
  const ROOF = PLINTH + WALL + 1.2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 6.5, 8), marble);
    base.position.y = 3.25;
    const opening = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.25, 3.6, 8, 1, true), recess);
    opening.position.y = 3.2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.6, 0.6, 8), panel);
    cap.position.y = 6.8;
    const dome = onionDome(3.9, 7, 32, null, marble);
    dome.position.y = 7.1;
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2.2, 6), gold);
    fin.position.y = 15;
    c.add(base, opening, cap, dome, fin);
    c.position.set(sx * 18, ROOF, sz * 18);
    g.add(c);
  }

  // drum, dome and finial
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(13, 13.4, 9, 48), marble);
  drum.position.y = ROOF + 4.5;
  const band = new THREE.Mesh(new THREE.TorusGeometry(13.2, 0.45, 8, 64), panel);
  band.rotation.x = Math.PI / 2;
  band.position.y = ROOF + 9;
  const dome = onionDome(13.6, 25, 64, null, marble);
  dome.position.y = ROOF + 9;
  const lotus = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), marble);
  lotus.position.y = ROOF + 33.5;
  const finial = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 6, 8), gold);
  rod.position.y = 3;
  const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), gold);
  k1.position.y = 2;
  const k2 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), gold);
  k2.position.y = 3.6;
  const moon = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.13, 6, 20, Math.PI * 1.2), gold);
  moon.position.y = 6.3;
  moon.rotation.z = -Math.PI * 0.1 - Math.PI / 2 + Math.PI;
  finial.add(rod, k1, k2, moon);
  finial.position.y = ROOF + 33.5;
  g.add(drum, band, dome, lotus, finial);

  // minarets
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const mn = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 3.3, 37, 16), marble);
    shaft.position.y = 18.5;
    mn.add(shaft);
    for (const y of [12, 24, 36]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 3.4, 1.0, 16), panel);
      ring.position.y = y;
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.9, 16, 1, true), marble);
      rail.position.y = y + 0.9;
      mn.add(ring, rail);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 3.2, 8, 1, true), recess);
    top.position.y = 38.6;
    const topRim = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.0, 0.5, 8), panel);
    topRim.position.y = 40.4;
    const td = onionDome(2.7, 4.6, 24, null, marble);
    td.position.y = 40.6;
    const tf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.6, 6), gold);
    tf.position.y = 45.8;
    mn.add(top, topRim, td, tf);
    mn.position.set(sx * 43, PLINTH, sz * 43);
    g.add(mn);
  }
  return g;
}

function sideHall(mats, red) {
  // the mosque and its mirror, the jawab: red sandstone with three white domes
  const g = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(22, 17, 58), red);
  hall.position.y = 8.5;
  g.add(hall);
  for (const z of [-17, 0, 17]) {
    const big = z === 0;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(big ? 5.2 : 4, big ? 5.2 : 4, 3, 24), mats.marble);
    drum.position.set(0, 18.5, z);
    const d = onionDome(big ? 5.6 : 4.3, big ? 9 : 7, 32, null, mats.marble);
    d.position.set(0, 20, z);
    g.add(drum, d);
    const arch = new THREE.Mesh(pointedArch(big ? 9 : 6, big ? 13 : 10), mats.recessRed);
    arch.position.set(11.05, 0.5, z);
    arch.rotation.y = Math.PI / 2;
    g.add(arch);
  }
  return g;
}

export function createTaj(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(renderer, scene, {
    elevation: 7, azimuth: 35, turbidity: 5, rayleigh: 2.2, mie: 0.004, mieG: 0.82, clouds: 0.22, envIntensity: 0.7,
  });
  scene.fog = new THREE.FogExp2(0xd9b9a6, 0.0012);
  const light = sunLight(scene, sun, 0xffd0a8, 3.2, 150, 700);
  scene.add(new THREE.HemisphereLight(0xb9cdf2, 0x5d6b3a, 0.55));

  const mats = {
    marble: new THREE.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.42 }),
    recess: new THREE.MeshStandardMaterial({ color: 0xa79d90, roughness: 0.8, side: THREE.DoubleSide }),
    panel: new THREE.MeshStandardMaterial({ color: 0xe2d9cc, roughness: 0.55, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd2ad5f, metalness: 0.85, roughness: 0.3 }),
  };
  const red = new THREE.MeshStandardMaterial({ color: 0x9e5038, roughness: 0.85 });
  mats.recessRed = new THREE.MeshStandardMaterial({ color: 0x5e2c1f, roughness: 0.9, side: THREE.DoubleSide });

  const taj = buildTaj(mats);
  taj.position.y = 1.2;
  scene.add(taj);

  // red sandstone terrace, garden, walkway, pool
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(300, 1.2, 120), red);
  terrace.position.set(0, 0.6, 0);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x55703a, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  const walk = new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, 340), new THREE.MeshStandardMaterial({ color: 0xd8c8b2, roughness: 0.8 }));
  walk.position.set(0, 0.15, 230);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(320, 0.28, 18), walk.material);
  cross.position.set(0, 0.14, 230);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.5, 302), mats.marble);
  rim.position.set(0, 0.3, 230);
  const pool = new Reflector(new THREE.PlaneGeometry(7, 300), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x7f8c95,
  });
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.56, 230);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(30, 1.4, 30), mats.marble);
  platform.position.set(0, 0.7, 230);
  scene.add(terrace, lawn, walk, cross, rim, pool, platform);

  for (const sx of [-1, 1]) {
    const hall = sideHall(mats, red);
    hall.position.set(sx * 118, 1.2, 0);
    if (sx < 0) hall.rotation.y = Math.PI;
    scene.add(hall);
  }

  // cypress avenues and garden trees
  const r = rng(11);
  const cypress = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 12, 8), new THREE.MeshStandardMaterial({ color: 0x2a4527, roughness: 1 }), 220);
  const o = new THREE.Object3D();
  let n = 0;
  for (const x of [-11, -17, 11, 17]) {
    for (let z = 66; z < 395; z += 8.5) {
      if (Math.abs(z - 230) < 18) continue;
      if (n >= 220) break;
      o.position.set(x, 6.2, z);
      o.scale.setScalar(0.85 + r() * 0.3);
      o.updateMatrix();
      cypress.setMatrixAt(n++, o.matrix);
    }
  }
  cypress.count = n;
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x3d5c2c, roughness: 1, flatShading: true }), 260);
  for (let i = 0; i < 260; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const s = 4 + r() * 4;
    o.position.set(side * (32 + r() * 150), s * 0.9, 70 + r() * 360);
    o.scale.set(s, s * 1.1, s);
    o.rotation.y = r() * 6;
    o.updateMatrix();
    trees.setMatrixAt(i, o.matrix);
  }
  scene.add(cypress, trees);

  scene.traverse((ob) => {
    if (ob.isMesh && ob !== pool && ob !== lawn) { ob.castShadow = true; ob.receiveShadow = true; }
  });
  lawn.receiveShadow = true;
  light.target.position.set(0, 0, 40);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 30000);
  const path = new CameraPath(
    [[0, 4.5, 360], [0, 8, 262], [4, 13, 175], [30, 21, 118], [72, 30, 82]],
    [[0, 36, 0], [0, 38, 0], [0, 40, 0], [0, 44, 0], [0, 48, 0]],
  );

  return {
    scene, camera, exposure: 0.55,
    resize(aspect) { camera.aspect = aspect; camera.fov = aspect < 0.9 ? 62 : 45; camera.updateProjectionMatrix(); },
    update(t) { path.apply(camera, t); },
  };
}
