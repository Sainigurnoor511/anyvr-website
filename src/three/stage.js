import * as THREE from 'three';

/**
 * Owns the renderer. Every scene renders into an HDR target first; a single
 * full-screen pass then composites it. That pass is where the "through the
 * headset" look lives: two lens circles with barrel distortion and colour
 * fringing that grow and slide together until they become the plain image,
 * so the stereo view and the full-screen view are one continuous effect.
 */
const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tSceneB;
uniform vec2 uRes;
uniform float uMix;
uniform float uExposureA;
uniform float uExposureB;
uniform float uLensOn;  // 0 = plain image, 1 = lens compositing
uniform float uOpen;    // 0 = eyes closed (black), 1 = open
uniform float uMerge;   // 0 = two eye circles, 1 = one full image
uniform float uWarp;    // teleport zoom blur
uniform float uFlash;   // teleport white-out
uniform float uFade;    // fade to black
uniform float uMotion;  // scroll velocity motion blur strength
uniform vec2 uMotionDir;
uniform vec3 uAccent;
uniform sampler2D tBloom;
uniform float uBloom;
varying vec2 vUv;

vec3 sampleScene(sampler2D source, vec2 uv) {
  vec3 col;
  if (uWarp > 0.002) {
    vec2 dir = uv - 0.5;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 14; i++) {
      float s = 1.0 - uWarp * 0.42 * float(i) / 13.0;
      acc += texture2D(source, 0.5 + dir * s).rgb;
    }
    col = acc / 14.0;
  } else {
    col = texture2D(source, uv).rgb;
  }
  if (uMotion > 0.002) {
    vec2 mdir = uMotionDir / max(length(uMotionDir), 1e-5) / uRes;
    vec3 b = col * 0.52;
    b += texture2D(source, uv + mdir * (0.8 + uMotion * 2.6)).rgb * 0.24;
    b += texture2D(source, uv - mdir * (0.8 + uMotion * 2.6)).rgb * 0.24;
    col = mix(col, b, clamp(uMotion, 0.0, 0.35));
  }
  return col;
}

vec3 sceneColor(vec2 uv) {
  if (uMix <= 0.0) return sampleScene(tScene, uv) * uExposureA;
  if (uMix >= 1.0) return sampleScene(tSceneB, uv) * uExposureB;
  return mix(sampleScene(tScene, uv) * uExposureA, sampleScene(tSceneB, uv) * uExposureB, uMix);
}

void main() {
  vec2 frag = vUv * uRes;
  vec3 col;
  if (uLensOn < 0.5 || (uMerge >= 1.0 && uOpen >= 1.0)) {
    col = sceneColor(vUv);
  } else {
    float sep = mix(uRes.x * 0.235, 0.0, smoothstep(0.0, 1.0, uMerge));
    vec2 cL = vec2(uRes.x * 0.5 - sep, uRes.y * 0.5);
    vec2 cR = vec2(uRes.x * 0.5 + sep, uRes.y * 0.5);
    float baseR = min(uRes.x * 0.215, uRes.y * 0.43);
    float R = mix(baseR, length(uRes) * 0.62, uMerge * uMerge) * uOpen;
    vec2 dL = frag - cL, dR = frag - cR;
    bool left = dot(dL, dL) < dot(dR, dR);
    vec2 d = left ? dL : dR;
    float r = length(d) / max(R, 1.0);
    float k = 0.2 * (1.0 - uMerge);
    vec2 dd = d * (1.0 + k * r * r);
    vec2 uv = 0.5 + dd / uRes;
    uv.x += (left ? 0.008 : -0.008) * (1.0 - uMerge);
    uv = mix(uv, vUv, smoothstep(0.0, 0.7, uMerge));
    vec2 n = normalize(d + 1e-4);
    float ca = 0.0015 * (1.0 - uMerge) * r * r;
    if (ca * max(uRes.x, uRes.y) > 0.25) {
      col = vec3(sceneColor(uv + n * ca).r, sceneColor(uv).g, sceneColor(uv - n * ca).b);
    } else {
      col = sceneColor(uv);
    }
    float inside = 1.0 - smoothstep(0.985, 1.0, r);
    col *= inside * mix(1.0, 1.0 - 0.45 * r * r, 1.0 - uMerge);
    float rim = smoothstep(0.98, 0.995, r) * (1.0 - smoothstep(0.995, 1.01, r));
    vec3 rimCol = uAccent * rim * 0.07 * (1.0 - uMerge) * uOpen;
    col += rimCol;
  }
  // bloom is sampled in screen space, so it follows the lens circles too
  col += texture2D(tBloom, vUv).rgb * uBloom * (uLensOn > 0.5 ? smoothstep(0.0, 1.0, uOpen) : 1.0);
  col = mix(col, vec3(3.0), uFlash);
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  col *= 1.0 - uFade;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/*
 * Bloom: a bright-pass into a half-resolution target, a dual-filter
 * downsample chain, then an upsample chain. Cheap and wide, so the sun,
 * the tower's lights and wet highlights glow the way a camera sees them.
 */
const bloomDown = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tSrcB;
uniform vec2 uTexel;
uniform float uFirst;
uniform float uMix;
uniform float uExpA;
uniform float uExpB;
uniform float uThreshold;
varying vec2 vUv;
vec3 tap(vec2 uv) {
  if (uFirst < 0.5) return texture2D(tSrc, uv).rgb;
  vec3 c = mix(texture2D(tSrc, uv).rgb * uExpA, texture2D(tSrcB, uv).rgb * uExpB, uMix);
  float l = max(c.r, max(c.g, c.b));
  return c * smoothstep(uThreshold, uThreshold * 2.2, l);
}
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = tap(vUv) * 4.0;
  c += tap(vUv - h) + tap(vUv + h) + tap(vUv + vec2(h.x, -h.y)) + tap(vUv - vec2(h.x, -h.y));
  gl_FragColor = vec4(min(c / 8.0, vec3(40.0)), 1.0);
}`;
const bloomUp = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tBase;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
}`;

export class Stage {
  constructor(canvas, { accent = '#ff7847', maxDpr = 1.75 } = {}) {
    this.canvas = canvas;
    this.maxDpr = maxDpr;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const gl = renderer.getContext();
    this.maxRenderSize = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    const colorSamples = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
    const depthSamples = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES);
    const samples = Math.max(0, ...Array.from(colorSamples || []).filter((n) => n <= 4 && depthSamples?.includes(n)));
    const targetOptions = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, samples };
    this.targetA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
    this.targetB = new THREE.WebGLRenderTarget(1, 1, targetOptions);

    this.uniforms = {
      tScene: { value: this.targetA.texture },
      tSceneB: { value: this.targetB.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMix: { value: 0 },
      uExposureA: { value: 1 },
      uExposureB: { value: 1 },
      uLensOn: { value: 0 },
      uOpen: { value: 1 },
      uMerge: { value: 1 },
      uWarp: { value: 0 },
      uFlash: { value: 0 },
      uFade: { value: 0 },
      uMotion: { value: 0 },
      uMotionDir: { value: new THREE.Vector2(0, 1) },
      uTime: { value: 0 },
      uAccent: { value: new THREE.Color(accent) },
    };
    const bloomOptions = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: false };
    this.down = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(1, 1, bloomOptions));
    this.up = Array.from({ length: 4 }, () => new THREE.WebGLRenderTarget(1, 1, bloomOptions));
    this.uniforms.tBloom = { value: this.up[0].texture };
    this.uniforms.uBloom = { value: 0.55 };
    const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.downMat = pass(bloomDown, {
      tSrc: { value: null }, tSrcB: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 1 },
      uMix: { value: 0 }, uExpA: { value: 1 }, uExpB: { value: 1 }, uThreshold: { value: 1.4 },
    });
    this.upMat = pass(bloomUp, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } });

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, depthTest: false, depthWrite: false }),
    );
    this.quad = quad;
    quad.frustumCulled = false;
    this.compositeMat = quad.material;
    this.post = new THREE.Scene();
    this.post.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.resize();
  }

  get size() {
    return { w: this.canvas.clientWidth || window.innerWidth, h: this.canvas.clientHeight || window.innerHeight };
  }

  resize() {
    const { w, h } = this.size;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const maxPixels = coarse ? 2400000 : 5000000;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr, coarse ? 1.5 : 2,
      Math.sqrt(maxPixels / (w * h)), this.maxRenderSize / Math.max(w, h));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.uniforms.uRes.value);
    const { x, y } = this.uniforms.uRes.value;
    this.targetA.setSize(x, y);
    this.targetB.setSize(x, y);
    this.down.forEach((t, i) => t.setSize(Math.max(1, x >> (i + 1)), Math.max(1, y >> (i + 1))));
    this.up.forEach((t, i) => t.setSize(Math.max(1, x >> (i + 1)), Math.max(1, y >> (i + 1))));
    this.aspect = w / h;
  }

  /** Runs a full-screen material into a target. */
  blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.post, this.postCam);
  }

  bloom(mix, expA, expB) {
    const d = this.downMat.uniforms, u = this.upMat.uniforms;
    d.uMix.value = mix; d.uExpA.value = expA; d.uExpB.value = expB;
    let src = this.targetA.texture;
    for (let i = 0; i < this.down.length; i++) {
      d.uFirst.value = i === 0 ? 1 : 0;
      d.tSrc.value = src;
      d.tSrcB.value = this.targetB.texture;
      const t = this.down[i];
      d.uTexel.value.set(1 / (i === 0 ? this.uniforms.uRes.value.x : this.down[i - 1].width), 1 / (i === 0 ? this.uniforms.uRes.value.y : this.down[i - 1].height));
      this.blit(this.downMat, t);
      src = t.texture;
    }
    for (let i = this.up.length - 1; i >= 0; i--) {
      const smaller = i === this.up.length - 1 ? this.down[i + 1] : this.up[i + 1];
      u.tSrc.value = smaller.texture;
      u.tBase.value = this.down[i].texture;
      u.uTexel.value.set(1 / smaller.width, 1 / smaller.height);
      this.blit(this.upMat, this.up[i]);
    }
  }

  render(scene, camera, exposure = 1) {
    this.renderBlend(scene, camera, exposure, null, null, exposure, 0);
  }

  renderBlend(sceneA, cameraA, exposureA, sceneB, cameraB, exposureB = exposureA, mix = 0) {
    const r = this.renderer;
    const blend = sceneB && cameraB ? THREE.MathUtils.clamp(mix, 0, 1) : 0;
    this.uniforms.uMix.value = blend;
    this.uniforms.uExposureA.value = exposureA;
    this.uniforms.uExposureB.value = exposureB;
    r.toneMapping = THREE.NoToneMapping;
    r.toneMappingExposure = 1;
    if (blend < 1) {
      r.setRenderTarget(this.targetA);
      r.render(sceneA, cameraA);
    }
    if (blend > 0) {
      r.setRenderTarget(this.targetB);
      r.render(sceneB, cameraB);
    }

    this.bloom(blend, exposureA, exposureB);
    r.setRenderTarget(null);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.quad.material = this.compositeMat;
    r.render(this.post, this.postCam);
  }
}
