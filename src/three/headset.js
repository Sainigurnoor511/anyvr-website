import * as THREE from 'three';

/**
 * A standalone headset modelled on the Quest 2 silhouette: a soft white
 * shell curved around the face, four corner tracking cameras, a black
 * facial interface holding the lenses, rigid side arms that turn into fabric
 * straps, a top strap and a rear cradle.
 *
 * The visor faces +z and the lenses sit at -z, so turning the group by PI
 * shows the wearer's view just before the headset goes on.
 */

const signedPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** Superellipsoid built from a dense sphere, so normals stay smooth and indexed. */
function superellipsoid({ hx, hy, hz, ex, ey, ez, curve = 0, bulge = 0, ws = 160, hs = 110 }) {
  const geo = new THREE.SphereGeometry(1, ws, hs);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = signedPow(p.getX(i), ex) * hx;
    const y = signedPow(p.getY(i), ey) * hy;
    let z = signedPow(p.getZ(i), ez) * hz;
    const nx = x / hx, ny = y / hy;
    // wrap the whole body around the face, and let the visor swell a little
    z -= curve * nx * nx;
    if (z > 0) z += bulge * (1 - nx * nx) * (1 - ny * ny * 0.8) * (z / hz);
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Fine noise used as a bump map: injection-moulded plastic and woven strap fabric. */
function microTexture(kind) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let seed = kind === 'fabric' ? 91 : 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 128 + (rnd() - 0.5) * 30;
      if (kind === 'fabric') {
        // a twill weave: diagonal ribs plus cross threads
        v = 128 + Math.sin((x + y) * 0.9) * 34 + Math.sin(y * 1.6) * 16 + (rnd() - 0.5) * 26;
      }
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

/**
 * A flat band swept along a path: side arms and fabric straps. `up` fixes
 * which way the band's width faces, so the strap never twists the way
 * Frenet frames do on a nearly straight path.
 */
function band(points, width, thickness, material, up = [0, 1, 0], steps = 120) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const ring = 20;
  const pos = [], idx = [];
  const U = new THREE.Vector3(...up), T = new THREE.Vector3(), S = new THREE.Vector3(), W = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    path.getPointAt(t, P);
    path.getTangentAt(t, T);
    S.crossVectors(T, U).normalize();
    W.crossVectors(S, T).normalize();
    // ends taper a touch so straps tuck into the hardware
    const taper = 1 - 0.25 * Math.pow(Math.abs(t * 2 - 1), 8);
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.35) * thickness / 2;
      const wy = Math.sign(sn) * Math.pow(Math.abs(sn), 0.35) * width / 2 * taper;
      pos.push(P.x + S.x * sx + W.x * wy, P.y + S.y * sx + W.y * wy, P.z + S.z * sx + W.z * wy);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k, b2 = i * ring + ((k + 1) % ring), c = a + ring, d = b2 + ring;
      idx.push(a, c, b2, b2, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // uv along the strap so the weave runs lengthwise
  const uv = [];
  for (let i = 0; i <= steps; i++) for (let k = 0; k < ring; k++) uv.push(k / ring, i / steps);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

export function buildHeadset() {
  const g = new THREE.Group();
  const plasticBump = microTexture('plastic');
  plasticBump.repeat.set(6, 6);
  const fabricBump = microTexture('fabric');
  fabricBump.repeat.set(2, 30);

  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xf2f2f0, roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.5,
    bumpMap: plasticBump, bumpScale: 0.12, sheen: 0.2, sheenColor: new THREE.Color(0xffffff),
  });
  const fabric = new THREE.MeshPhysicalMaterial({
    color: 0xe9e9e7, roughness: 0.92, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff),
    bumpMap: fabricBump, bumpScale: 0.9,
  });
  const foam = new THREE.MeshPhysicalMaterial({ color: 0x1d1e21, roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color(0x3a3b40) });
  const cavity = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.55 });
  const camGlass = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.06, clearcoat: 1, metalness: 0.2 });
  const lensGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0c1218, roughness: 0.04, metalness: 0.1, clearcoat: 1, iridescence: 0.7, iridescenceIOR: 1.5,
    iridescenceThicknessRange: [180, 420],
  });
  const lensRing = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.35, metalness: 0.5 });

  // shell: front cover and body read as one pillow, with a shallow seam between them
  const body = new THREE.Mesh(superellipsoid({ hx: 1.0, hy: 0.57, hz: 0.42, ex: 0.4, ey: 0.42, ez: 0.62, curve: 0.13, bulge: 0.05 }), shell);
  g.add(body);

  // seam: a dark hairline around the body, a third of the way back from the visor
  const seamPts = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const x = signedPow(c, 0.4) * 1.003, y = signedPow(s, 0.42) * 0.573;
    seamPts.push(new THREE.Vector3(x, y, 0.1 - 0.13 * x * x));
  }
  const seam = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts, true), 400, 0.0045, 6, true),
    new THREE.MeshStandardMaterial({ color: 0x9a9b9e, roughness: 0.6 }),
  );
  g.add(seam);

  // the four tracking cameras sit on the visor's curve; find the surface by raycasting
  const ray = new THREE.Raycaster();
  body.updateMatrixWorld();
  const camGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.02, 40);
  camGeo.rotateX(Math.PI / 2);
  const bezelGeo = new THREE.TorusGeometry(0.043, 0.008, 12, 48);
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d2, roughness: 0.4 });
  for (const [x, y] of [[-0.74, 0.34], [0.74, 0.34], [-0.76, -0.33], [0.76, -0.33]]) {
    ray.set(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(body)[0];
    if (!hit) continue;
    const n = hit.face.normal.clone().transformDirection(body.matrixWorld);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const c = new THREE.Mesh(camGeo, camGlass);
    c.position.copy(hit.point).addScaledVector(n, 0.002);
    c.quaternion.copy(q);
    const b = new THREE.Mesh(bezelGeo, bezelMat);
    b.position.copy(hit.point).addScaledVector(n, 0.004);
    b.quaternion.copy(q);
    g.add(c, b);
  }

  // facial interface: black gasket behind the shell, with a dark cavity and the lenses
  const gasket = new THREE.Mesh(superellipsoid({ hx: 0.93, hy: 0.51, hz: 0.2, ex: 0.42, ey: 0.45, ez: 0.8, curve: 0.16, ws: 120, hs: 80 }), foam);
  gasket.position.z = -0.4;
  g.add(gasket);
  const hollow = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(1.5, 0.74, 0.3), 24), cavity);
  hollow.position.set(0, 0.03, -0.61);
  hollow.rotation.y = Math.PI;
  g.add(hollow);
  // nose bridge, the grey part that shows under the visor
  const nose = new THREE.Mesh(superellipsoid({ hx: 0.2, hy: 0.16, hz: 0.18, ex: 0.6, ey: 0.6, ez: 0.6, ws: 48, hs: 32 }), graphite);
  nose.position.set(0, -0.5, -0.36);
  nose.scale.set(1, 0.8, 1);
  g.add(nose);
  // a shallow glass dome: radius 0.6 sphere cut to a 0.22 aperture
  const lensGeo = new THREE.SphereGeometry(0.6, 96, 16, 0, Math.PI * 2, 0, 0.375);
  lensGeo.rotateX(-Math.PI / 2);
  lensGeo.translate(0, 0, 0.558);
  const lensRingGeo = new THREE.TorusGeometry(0.235, 0.022, 16, 96);
  for (const x of [-0.37, 0.37]) {
    const lens = new THREE.Mesh(lensGeo, lensGlass);
    lens.position.set(x, 0.05, -0.605);
    const ring = new THREE.Mesh(lensRingGeo, lensRing);
    ring.position.set(x, 0.05, -0.612);
    g.add(lens, ring);
  }

  // rigid side arms, then fabric straps that wrap round the back of the head.
  // The straps live in a harness pivoting at the arms, so they can be flipped
  // up out of the way as the headset comes to the eyes.
  const harness = new THREE.Group();
  harness.position.set(0, 0, -0.75);
  const hb = (...args) => { const m = band(...args); m.position.z += 0.75; harness.add(m); return m; };
  g.add(harness);
  g.userData.harness = harness;
  for (const s of [-1, 1]) {
    g.add(band([[s * 0.93, 0.02, -0.1], [s * 1.0, 0.01, -0.5], [s * 1.0, -0.01, -0.95]], 0.21, 0.07, shell, [0, 1, 0], 60));
    hb(([
      [s * 0.99, -0.02, -0.9], [s * 0.97, -0.05, -1.45], [s * 0.78, -0.12, -2.05], [s * 0.42, -0.2, -2.45], [s * 0.08, -0.22, -2.58],
    ]), 0.22, 0.03, fabric, [0, 1, 0], 100);
    // the upper branch of the rear "Y"
    hb([[s * 0.8, -0.1, -2.0], [s * 0.48, 0.12, -2.38], [s * 0.1, 0.28, -2.55]], 0.16, 0.028, fabric, [0, 1, 0], 60);
  }
  // top strap: its width runs side to side
  hb([[0, 0.52, -0.2], [0, 0.88, -0.75], [0, 1.0, -1.45], [0, 0.8, -2.12], [0, 0.36, -2.52]], 0.24, 0.03, fabric, [1, 0, 0], 120);
  // rear cradle where the straps meet
  const cradle = new THREE.Mesh(superellipsoid({ hx: 0.2, hy: 0.32, hz: 0.06, ex: 0.55, ey: 0.6, ez: 0.8, ws: 48, hs: 32 }), shell);
  cradle.position.set(0, 0.06, -2.56 + 0.75);
  harness.add(cradle);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
