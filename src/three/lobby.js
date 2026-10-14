import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CameraPath, dotTexture, rng } from './util.js';

/**
 * The AnyVR lobby: what you see the moment the headset is on. Three hologram
 * miniatures, drawn as edges of the very models you are about to visit, on
 * pedestals around you, with the AI guide floating at your side.
 */
function hologram(group, height, threshold = 28) {
  group.updateMatrixWorld(true);
  const parts = [];
  const m = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const edges = new THREE.EdgesGeometry(o.geometry, threshold);
    if (o.isInstancedMesh) {
      // instanced beams: twelve box edges are too busy at this size, keep the long axis only
      const axis = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 0.5, 0)]);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        parts.push(axis.clone().applyMatrix4(m).applyMatrix4(o.matrixWorld));
      }
    } else {
      parts.push(edges.applyMatrix4(o.matrixWorld));
    }
  });
  const geo = mergeGeometries(parts.map((p) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', p.getAttribute('position'));
    return g;
  }));
  geo.computeBoundingBox();
  const bb = geo.boundingBox, s = height / (bb.max.y - bb.min.y);
  const c = bb.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -bb.min.y, -c.z);
  geo.scale(s, s, s);
  return geo;
}

function pyramidsGroup() {
  const g = new THREE.Group();
  const p = (base, h, x, z, y = 0) => {
    const geo = new THREE.CylinderGeometry(0, base / Math.SQRT2, h, 4, 1);
    geo.rotateY(Math.PI / 4);
    const m = new THREE.Mesh(geo);
    m.position.set(x, h / 2 + y, z);
    g.add(m);
  };
  p(230, 146, 0, 0);
  p(215, 136, -300, -330, 10);
  p(103, 65, -520, -660);
  return g;
}

function tajMiniGroup() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(96, 8, 96)));
  const body = new THREE.Mesh(new THREE.BoxGeometry(56, 30, 56));
  body.position.y = 19;
  g.add(body);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 13.5, 8.5, 24));
  drum.position.y = 38.5;
  g.add(drum);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(15, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2));
  dome.position.y = 45;
  g.add(dome);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const minaret = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 42, 12));
    minaret.position.set(sx * 43, 21, sz * 43);
    g.add(minaret);
  }
  return g;
}

function eiffelMiniGroup() {
  const g = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(1.3, 2.4, 76, 10);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    const leg = new THREE.Mesh(legGeo);
    leg.position.set(sx * 16, 38, sz * 16);
    leg.rotation.z = sx * 0.14;
    leg.rotation.x = sz * 0.14;
    g.add(leg);
  }
  const deck1 = new THREE.Mesh(new THREE.BoxGeometry(42, 4, 42));
  deck1.position.y = 28;
  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(24, 3, 24));
  deck2.position.y = 51;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4.2, 36, 10));
  mast.position.y = 70;
  g.add(deck1, deck2, mast);
  return g;
}

export function createLobby(renderer, accent) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.fog = new THREE.Fog(0x05070b, 14, 46);

  const lineMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const dimMat = lineMat.clone();
  dimMat.color = new THREE.Color(0x9fb2c8);
  dimMat.opacity = 0.45;

  const geos = [
    hologram(tajMiniGroup(), 1.9),
    hologram(eiffelMiniGroup(), 2.6),
    hologram(pyramidsGroup(), 1.2, 1),
  ];
  // the Giza group is wide, so it is also scaled down to the same footprint
  const spots = [[-3.3, -0.6], [0, -1.6], [3.3, -0.6]];
  const holos = geos.map((geo, i) => {
    const l = new THREE.LineSegments(geo, i === 0 ? lineMat : dimMat);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.3, 0.9, 48),
      new THREE.MeshStandardMaterial({ color: 0x12151b, roughness: 0.35, metalness: 0.6 }),
    );
    pedestal.position.y = 0.45;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.015, 8, 96), new THREE.MeshBasicMaterial({ color: i === 0 ? accent : 0x45505e }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.91;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 3.4, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: i === 0 ? 0.05 : 0.02, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 2.6;
    const holder = new THREE.Group();
    l.position.y = 1.05;
    if (i === 2) l.scale.setScalar(0.62);
    holder.add(pedestal, ring, beam, l);
    holder.position.set(spots[i][0], 0, spots[i][1]);
    scene.add(holder);
    return { holder, lines: l, ring, beam };
  });

  // floor: a dark disc with a polar grid
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.2, metalness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  const grid = new THREE.PolarGridHelper(22, 24, 12, 96, 0x1d2430, 0x1d2430);
  grid.position.y = 0.01;
  scene.add(floor, grid);

  // the AI guide: a small orb with an orbiting ring
  const guide = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 2.2, roughness: 0.2 }));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }));
  const halo2 = halo.clone();
  halo2.scale.setScalar(1.35);
  guide.add(orb, halo, halo2);
  guide.position.set(1.7, 2.45, 3.4);
  const guideLight = new THREE.PointLight(accent, 8, 8, 2);
  guide.add(guideLight);
  scene.add(guide);

  scene.add(new THREE.AmbientLight(0x8899aa, 0.5));
  const top = new THREE.SpotLight(0xffffff, 60, 30, 0.5, 0.8);
  top.position.set(0, 12, 4);
  scene.add(top);

  // stars
  const r = rng(8), N = 1800, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3(r() - 0.5, r() * 0.9 - 0.1, r() - 0.5).normalize().multiplyScalar(60 + r() * 30);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.35, map: dotTexture(), transparent: true, depthWrite: false, color: 0xcfd8ff, fog: false }));
  scene.add(stars);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 300);
  const path = new CameraPath(
    [[0, 2.0, 9.5], [-0.4, 1.95, 7.6], [-1.6, 1.9, 4.6], [-2.9, 2.0, 1.9], [-3.25, 2.05, 0.05]],
    [[0, 1.8, 0], [-0.6, 1.8, -0.5], [-2.2, 1.9, -0.6], [-3.2, 1.95, -0.6], [-3.3, 1.95, -0.7]],
  );

  return {
    scene, camera, exposure: 1,
    resize(aspect) { camera.aspect = aspect; camera.fov = aspect < 0.9 ? 72 : 55; camera.updateProjectionMatrix(); },
    /** t is lobby-local progress; `pick` 0..1 brightens the Taj hologram as it is chosen. */
    update(t, time, pick) {
      path.apply(camera, t);
      holos.forEach((h, i) => {
        h.lines.rotation.y = time * 0.25 + i;
        h.holder.position.y = Math.sin(time * 0.8 + i) * 0.03;
      });
      holos[0].beam.material.opacity = 0.05 + pick * 0.12;
      lineMat.opacity = 0.7 + pick * 0.3 + Math.sin(time * 6) * 0.05 * pick;
      guide.position.y = 2.45 + Math.sin(time * 1.4) * 0.08;
      halo.rotation.set(time * 0.9, time * 0.6, 0);
      halo2.rotation.set(-time * 0.5, 0, time * 0.7);
      stars.rotation.y = time * 0.004;
    },
  };
}
