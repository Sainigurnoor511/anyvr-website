import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * A standalone VR headset, built from primitives. The visor faces +z; the
 * lenses sit on the facial interface at -z, so turning it by PI shows the
 * view a wearer gets just before putting it on.
 */
export function buildHeadset(accent) {
  const g = new THREE.Group();

  const shell = new THREE.MeshPhysicalMaterial({ color: 0xe7e7ea, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const foam = new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.95 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1018, roughness: 0.05, metalness: 0.4, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.4, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 3 });

  // main body
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.12, 0.78, 6, 0.3), shell);
  g.add(body);

  // front visor, slightly proud of the shell
  const front = new THREE.Mesh(new RoundedBoxGeometry(1.84, 0.98, 0.12, 5, 0.06), visor);
  front.position.z = 0.36;
  g.add(front);

  // tracking cameras in the four corners of the visor
  const camGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 20);
  camGeo.rotateX(Math.PI / 2);
  const camMat = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1 });
  for (const [x, y] of [[-0.72, 0.3], [0.72, 0.3], [-0.72, -0.3], [0.72, -0.3]]) {
    const c = new THREE.Mesh(camGeo, camMat);
    c.position.set(x, y, 0.43);
    g.add(c);
  }

  // status light: the one accent on the device
  const led = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.03, 0.02, 2, 0.01), glow);
  led.position.set(0, -0.42, 0.425);
  g.add(led);

  // facial interface
  const face = new THREE.Mesh(new RoundedBoxGeometry(1.86, 0.98, 0.36, 6, 0.16), foam);
  face.position.z = -0.48;
  g.add(face);

  // nose cut, a dark wedge under the lenses
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.2, 0.3, 3), new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 1 }));
  nose.rotation.x = Math.PI / 2;
  nose.rotation.y = Math.PI;
  nose.position.set(0, -0.4, -0.62);
  g.add(nose);

  // lenses
  const lensGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.04, 48);
  lensGeo.rotateX(Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(0.29, 0.035, 12, 48);
  for (const x of [-0.43, 0.43]) {
    const l = new THREE.Mesh(lensGeo, glass);
    l.position.set(x, 0.04, -0.665);
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.position.set(x, 0.04, -0.665);
    g.add(l, r);
  }

  // side arms and a rear strap loop
  const armGeo = new RoundedBoxGeometry(0.1, 0.22, 0.9, 3, 0.04);
  for (const x of [-1.02, 1.02]) {
    const a = new THREE.Mesh(armGeo, strap);
    a.position.set(x, 0, -0.75);
    g.add(a);
  }
  const loop = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 14, 80, Math.PI), strap);
  loop.rotation.x = Math.PI / 2;
  loop.rotation.z = Math.PI;
  loop.scale.set(1.04, 1.25, 1);
  loop.position.z = -1.18;
  g.add(loop);
  const top = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.055, 12, 64, Math.PI * 0.62), strap);
  top.rotation.y = Math.PI / 2;
  top.rotation.z = Math.PI * 0.19;
  top.position.set(0, 0.05, -1.05);
  g.add(top);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
