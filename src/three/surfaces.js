import * as THREE from 'three';
import { rng } from './util.js';

const cache = new WeakMap();

export function surfaceMaps(renderer, kind) {
  let surfaces = cache.get(renderer);
  if (!surfaces) { surfaces = new Map(); cache.set(renderer, surfaces); }
  if (surfaces.has(kind)) return surfaces.get(kind);

  const size = 512;
  const seed = { marble: 31, iron: 73, sandstone: 109 }[kind];
  const random = rng(seed);
  const fields = [8, 32, 128].map((n) => {
    const values = Float32Array.from({ length: n * n }, () => random());
    return (u, v) => {
      const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const at = (a, b) => values[((b % n + n) % n) * n + ((a % n + n) % n)];
      return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx),
        THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy,
      );
    };
  });
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  });
  const contexts = canvases.map((canvas) => canvas.getContext('2d'));
  const images = contexts.map((context) => context.createImageData(size, size));
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const broad = fields[0](u, v), medium = fields[1](u, v), fine = fields[2](u, v);
      const grain = random() - 0.5;
      let color, height, roughness;
      if (kind === 'marble') {
        const flow = Math.sin(tau * (u * 3 + v * 2) + 3 * Math.sin(tau * v) + broad * 4);
        const vein = Math.pow(1 - Math.abs(flow), 18);
        const shade = broad * 4 + grain * 1.6 - vein * 17;
        color = [246 + shade, 242 + shade, 234 + shade];
        height = 128 + (fine - 0.5) * 9 - vein * 3;
        roughness = 182 + medium * 28 + vein * 8;
      } else if (kind === 'iron') {
        const patina = THREE.MathUtils.smoothstep(broad * 0.65 + medium * 0.35, 0.48, 0.8);
        const pits = Math.max(0, fine - 0.7) * 65;
        const streak = Math.sin(tau * u * 48 + Math.sin(tau * v) * 0.6) * 1.5;
        const shade = (medium - 0.5) * 16 + grain * 7 + streak;
        color = [116 + shade + patina * 15, 91 + shade - patina * 5, 70 + shade - patina * 9];
        height = 130 + grain * 9 - pits + medium * 7;
        roughness = 172 + patina * 55 + fine * 15;
      } else {
        const strata = Math.sin(tau * v * 12 + Math.sin(tau * u * 2) * 0.5 + broad) * 1.5;
        const pores = Math.max(0, fine - 0.64) * 80;
        const shade = (broad - 0.5) * 14 + (medium - 0.5) * 8 + grain * 5 + strata - pores * 0.25;
        color = [224 + shade, 185 + shade, 141 + shade];
        height = 128 + (medium - 0.5) * 16 + grain * 7 + strata - pores * 0.65;
        roughness = 224 + fine * 25;
      }
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        images[0].data[i + c] = color[c];
        images[1].data[i + c] = height;
        images[2].data[i + c] = roughness;
      }
      for (const image of images) image.data[i + 3] = 255;
    }
  }
  const textures = canvases.map((canvas, i) => {
    contexts[i].putImageData(images[i], 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    texture.name = `${kind}-${['color', 'bump', 'roughness'][i]}`;
    return texture;
  });
  const maps = { map: textures[0], bumpMap: textures[1], roughnessMap: textures[2] };
  surfaces.set(kind, maps);
  return maps;
}
