import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { CameraPath, makeSky, onionDome, rng, sunLight } from './util.js';
import { scanned } from './textures.js';
import { loadTaj } from './taj-model.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The Taj Mahal at roughly real scale (metres): a 95 m plinth, a chamfered
 * 56 m mausoleum with a pishtaq (great arch) on each face, the onion dome on
 * its drum, four chhatris, and four minarets at the plinth corners.
 */
const S = 56, C = 8, PLINTH = 6.7, WALL = 30;

function archShape(w, h) {
  const s = new THREE.Shape(), hs = h - w * 0.62;
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, hs);
  s.quadraticCurveTo(-w / 2, h - w * 0.12, 0, h);
  s.quadraticCurveTo(w / 2, h - w * 0.12, w / 2, hs);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

function pointedArch(w, h) {
  return new THREE.ShapeGeometry(archShape(w, h), 14);
}

function archMolding(w, h, border, depth) {
  const shape = archShape(w, h);
  const hole = new THREE.Path(archShape(w - border * 2, h - border * 2).getPoints(14)
    .map((p) => new THREE.Vector2(p.x, p.y + border)));
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 14, bevelEnabled: true,
    bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1,
  });
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);
  return geometry;
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
  mesh.rotation.set(0, f.a, 0);
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
  // Inset the bevel so the shallow arch recesses remain outside the wall faces.
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: WALL, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12,
    bevelOffset: -0.12, bevelSegments: 1,
  });
  bodyGeo.rotateX(-Math.PI / 2);
  const bodyUV = bodyGeo.attributes.uv;
  for (let i = 0; i < bodyUV.count; i++) bodyUV.setXY(i, bodyUV.getX(i) / 12, bodyUV.getY(i) / 12);
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
  const trims = [
    new THREE.InstancedMesh(archMolding(14.5, 25, 0.48, 0.24), panel, 4),
    new THREE.InstancedMesh(archMolding(6.7, 11.2, 0.3, 0.16), panel, 16),
    new THREE.InstancedMesh(archMolding(7.3, 11.2, 0.3, 0.16), panel, 8),
  ];
  const inlay = new THREE.MeshStandardMaterial({ color: 0x51463e, roughness: 0.65 });
  const archInlays = new THREE.InstancedMesh(archMolding(15.05, 25.65, 0.1, 0.035), inlay, 4);
  const trimCounts = [0, 0, 0];
  const detail = new THREE.Object3D();
  const placeTrim = (index, f, along, y, out) => {
    placeOnFace(detail, f, along, y, out).updateMatrix();
    trims[index].setMatrixAt(trimCounts[index]++, detail.matrix);
  };
  let inlayCount = 0;
  for (const f of faces) {
    if (f.kind === 'main') {
      const pish = new THREE.Mesh(new THREE.BoxGeometry(22, 35, 1.8), marble);
      g.add(placeOnFace(pish, f, 0, PLINTH + 17.5, 0.5));
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(17, 28.5), panel);
      g.add(placeOnFace(frame, f, 0, PLINTH + 15, 1.42));
      const arch = new THREE.Mesh(bigArch, recess);
      g.add(placeOnFace(arch, f, 0, PLINTH + 0.6, 1.45));
      placeTrim(0, f, 0, PLINTH + 0.12, 1.49);
      placeOnFace(detail, f, 0, PLINTH - 0.08, 1.48).updateMatrix();
      archInlays.setMatrixAt(inlayCount++, detail.matrix);
      for (const s of [-1, 1]) {
        for (const y of [PLINTH + 1.5, PLINTH + 15.5]) {
          g.add(placeOnFace(new THREE.Mesh(sideArch, recess), f, s * 15.6, y, 0.05));
          placeTrim(1, f, s * 15.6, y - 0.3, 0.12);
        }
        // guldastas framing the pishtaq
        g.add(placeOnFace(new THREE.Mesh(pinnacle, marble), f, s * 11.2, PLINTH + 38, 0.6));
        g.add(placeOnFace(new THREE.Mesh(pinTop, marble), f, s * 11.2, PLINTH + 42.2, 0.6));
      }
    } else {
      for (const y of [PLINTH + 1.5, PLINTH + 15.5]) {
        g.add(placeOnFace(new THREE.Mesh(chamArch, recess), f, 0, y, 0.05));
        placeTrim(2, f, 0, y - 0.3, 0.12);
      }
    }
  }
  g.add(...trims, archInlays);

  const petal = new THREE.Shape();
  petal.moveTo(0, -1);
  petal.quadraticCurveTo(-1, -0.2, 0, 1);
  petal.quadraticCurveTo(1, -0.2, 0, -1);
  const petals = new THREE.InstancedMesh(new THREE.ShapeGeometry(petal, 4),
    new THREE.MeshStandardMaterial({ color: 0x885a49, roughness: 0.58 }), 4 * 2 * 7 * 4);
  let petalCount = 0;
  for (const f of faces.filter((face) => face.kind === 'main')) {
    for (const side of [-1, 1]) {
      for (let row = 0; row < 7; row++) {
        for (let p = 0; p < 4; p++) {
          const a = p * Math.PI / 2;
          placeOnFace(detail, f, side * 9.6 + Math.sin(a) * 0.17, PLINTH + 3 + row * 3.9 + Math.cos(a) * 0.24, 1.43);
          detail.rotateZ(-a);
          detail.scale.set(0.09, 0.23, 0.025);
          detail.updateMatrix();
          petals.setMatrixAt(petalCount++, detail.matrix);
        }
      }
    }
  }
  g.add(petals);

  // chhatris on the roof corners
  const ROOF = PLINTH + WALL + 1.2;
  const columnProfile = [[0.48, 0], [0.48, 0.18], [0.33, 0.3], [0.24, 0.6],
    [0.21, 4.55], [0.31, 4.8], [0.5, 5], [0.5, 5.2]].map(([r, y]) => new THREE.Vector2(r, y));
  const columns = new THREE.InstancedMesh(new THREE.LatheGeometry(columnProfile, 10), marble, 64);
  let columnCount = 0;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 1.1, 8), marble);
    base.position.y = 0.55;
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4;
      detail.position.set(sx * 18 + Math.sin(a) * 3.75, ROOF + 1.1, sz * 18 + Math.cos(a) * 3.75);
      detail.rotation.set(0, a, 0);
      detail.scale.setScalar(1);
      detail.updateMatrix();
      columns.setMatrixAt(columnCount++, detail.matrix);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.6, 0.6, 8), panel);
    cap.position.y = 6.8;
    const dome = onionDome(3.9, 7, 32, null, marble);
    dome.position.y = 7.1;
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2.2, 6), gold);
    fin.position.y = 15;
    const lintel = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.1, 0.5, 8), marble);
    lintel.position.y = 6.4;
    c.add(base, lintel, cap, dome, fin);
    c.position.set(sx * 18, ROOF, sz * 18);
    g.add(c);
  }
  g.add(columns);

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
  const balusters = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 0.85, 6), marble, 288);
  const balconyRail = new THREE.TorusGeometry(4.03, 0.12, 6, 32);
  let balusterCount = 0;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const mn = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 3.3, 37, 32), marble);
    shaft.position.y = 18.5;
    mn.add(shaft);
    for (const y of [12, 24, 36]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 3.4, 1.0, 16), panel);
      ring.position.y = y;
      const rail = new THREE.Mesh(balconyRail, marble);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = y + 1.35;
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12;
        detail.position.set(sx * 43 + Math.sin(a) * 4.03, PLINTH + y + 0.925, sz * 43 + Math.cos(a) * 4.03);
        detail.rotation.set(0, a, 0);
        detail.scale.setScalar(1);
        detail.updateMatrix();
        balusters.setMatrixAt(balusterCount++, detail.matrix);
      }
      mn.add(ring, rail);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4;
      detail.position.set(sx * 43 + Math.sin(a) * 2.5, PLINTH + 37, sz * 43 + Math.cos(a) * 2.5);
      detail.rotation.set(0, a, 0);
      detail.scale.set(0.8, 3.2 / 5.2, 0.8);
      detail.updateMatrix();
      columns.setMatrixAt(columnCount++, detail.matrix);
    }
    const topRim = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.0, 0.5, 8), panel);
    topRim.position.y = 40.4;
    const td = onionDome(2.7, 4.6, 24, null, marble);
    td.position.y = 40.6;
    const tf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.6, 6), gold);
    tf.position.y = 45.8;
    mn.add(topRim, td, tf);
    mn.position.set(sx * 43, PLINTH, sz * 43);
    g.add(mn);
  }
  g.add(balusters);
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

export async function createTaj(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(renderer, scene, {
    elevation: 7, azimuth: 35, turbidity: 5, rayleigh: 2.2, mie: 0.004, mieG: 0.82, clouds: 0.22, envIntensity: 0.7,
  });
  scene.fog = new THREE.FogExp2(0xd9b9a6, 0.0012);
  const light = sunLight(scene, sun, 0xffd0a8, 3.2, 150, 700);
  scene.add(new THREE.HemisphereLight(0xb9cdf2, 0x5d6b3a, 0.55));

  const mats = {
    // Makrana marble: a photo-scanned white marble set, tiled every ~2.5 m
    marble: scanned('marble_01', { color: 0xfffaf4, roughness: 0.7 }, { scale: 0.4, normalScale: 0.5, saturation: 0.18, gain: 1.45 }),
    recess: new THREE.MeshStandardMaterial({ color: 0xa79d90, roughness: 0.8, side: THREE.DoubleSide }),
    panel: scanned('marble_01', { color: 0xe9e1d4, roughness: 0.8, side: THREE.DoubleSide }, { scale: 0.7, normalScale: 0.5, saturation: 0.3, gain: 1.3 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd2ad5f, metalness: 0.85, roughness: 0.3 }),
  };
  const red = scanned('red_sandstone_wall', { color: 0xd9a08a, roughness: 1 }, { scale: 0.3 });
  mats.recessRed = new THREE.MeshStandardMaterial({ color: 0x5e2c1f, roughness: 0.9, side: THREE.DoubleSide });

  const { group: taj } = await loadTaj(mats);
  taj.position.y = 1.2;
  scene.add(taj);

  // red sandstone terrace, garden, walkway, pool
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(300, 1.2, 120), red);
  terrace.position.set(0, 0.6, 0);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), scanned('leafy_grass', { color: 0xb8c79a, roughness: 1 }, { scale: 0.35, macro: 0.6 }));
  lawn.rotation.x = -Math.PI / 2;
  const walk = new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, 340), scanned('red_sandstone_pavement', { color: 0xf0d3c2, roughness: 0.95 }, { scale: 0.35, macro: 0.3 }));
  walk.position.set(0, 0.15, 230);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(320, 0.28, 18), walk.material);
  cross.position.set(0, 0.14, 230);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.5, 302), mats.marble);
  rim.position.set(0, 0.3, 230);
  const pool = new Reflector(new THREE.PlaneGeometry(7, 300), {
    clipBias: 0.003,
    textureWidth: 768,
    textureHeight: 768,
    multisample: 0,
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
  // lumpy leaf clusters: a subdivided sphere pushed in and out, shaded with a leaf scan
  const foliage = new THREE.IcosahedronGeometry(1, 1);
  const foliagePosition = foliage.attributes.position;
  const lump = new THREE.Vector3();
  for (let i = 0; i < foliagePosition.count; i++) {
    lump.fromBufferAttribute(foliagePosition, i);
    const k = 1 + 0.16 * Math.sin(lump.x * 7.1 + lump.y * 3.3) * Math.cos(lump.z * 6.3 - lump.y * 2.1) + 0.06 * Math.sin(lump.y * 17 + lump.x * 11);
    foliagePosition.setXYZ(i, lump.x * k, lump.y * k, lump.z * k);
  }
  foliage.deleteAttribute('normal');
  foliage.deleteAttribute('uv');
  const smoothFoliage = mergeVertices(foliage);
  smoothFoliage.computeVertexNormals();
  const leaves = scanned('leafy_grass', { color: 0xffffff, roughness: 1 }, { scale: 0.9, normalScale: 1.4 });
  const cypress = new THREE.InstancedMesh(smoothFoliage, leaves, 220 * 8);
  const o = new THREE.Object3D();
  const leafColor = new THREE.Color();
  let n = 0;
  for (const x of [-11, -17, 11, 17]) {
    for (let z = 66; z < 395; z += 8.5) {
      if (Math.abs(z - 230) < 18) continue;
      const height = 9 + r() * 2, width = 0.9 + r() * 0.2;
      for (let cluster = 0; cluster < 8; cluster++) {
        const a = cluster * 2.4 + r() * 0.35;
        const tier = cluster < 6 ? cluster / 6 : 0.5;
        const radius = cluster < 6 ? width * (0.7 - tier * 0.4) : 0;
        o.position.set(x + Math.cos(a) * radius, cluster === 7 ? height * 0.88 : height * (0.23 + tier * 0.55), z + Math.sin(a) * radius);
        o.scale.set(width * (cluster === 7 ? 0.45 : 0.78), height * (cluster === 6 ? 0.42 : 0.2), width * 0.7);
        o.rotation.set((r() - 0.5) * 0.12, a, (r() - 0.5) * 0.12);
        o.updateMatrix();
        cypress.setMatrixAt(n, o.matrix);
        leafColor.setHSL(0.3 + r() * 0.04, 0.35 + r() * 0.1, 0.22 + r() * 0.06);
        cypress.setColorAt(n++, leafColor);
      }
    }
  }
  cypress.count = n;
  const trees = new THREE.InstancedMesh(smoothFoliage, leaves, 260 * 5);
  for (let i = 0; i < 260; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const s = 3.2 + r() * 2.8;
    const x = side * (35 + r() * 147), z = 70 + r() * 360;
    for (let cluster = 0; cluster < 5; cluster++) {
      const a = cluster * 2.4 + r() * 0.5;
      const radius = cluster ? s * 0.48 : 0;
      o.position.set(x + Math.cos(a) * radius, s * (cluster ? 0.85 + r() * 0.35 : 1.25), z + Math.sin(a) * radius);
      o.scale.set(s * (0.65 + r() * 0.2), s * (0.6 + r() * 0.2), s * (0.65 + r() * 0.2));
      o.rotation.set(r() * 0.4, a, r() * 0.3);
      o.updateMatrix();
      trees.setMatrixAt(i * 5 + cluster, o.matrix);
      leafColor.setHSL(0.24 + r() * 0.06, 0.3 + r() * 0.15, 0.4 + r() * 0.12);
      trees.setColorAt(i * 5 + cluster, leafColor);
    }
  }
  scene.add(cypress, trees);
  const reflect = pool.onBeforeRender;
  pool.onBeforeRender = (...args) => {
    cypress.visible = trees.visible = false;
    reflect.apply(pool, args);
    cypress.visible = trees.visible = true;
  };

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
