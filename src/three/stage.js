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
uniform float uLensOn;  // 0 = plain image, 1 = lens compositing
uniform float uOpen;    // 0 = eyes closed (black), 1 = open
uniform float uMerge;   // 0 = two eye circles, 1 = one full image
uniform float uWarp;    // teleport zoom blur
uniform float uFlash;   // teleport white-out
uniform float uFade;    // fade to black
uniform float uMotion;  // scroll velocity motion blur strength
uniform vec2 uMotionDir;
uniform float uTime;
uniform vec3 uAccent;
varying vec2 vUv;

vec3 sceneA(vec2 uv) {
  if (uWarp < 0.002) return texture2D(tScene, uv).rgb;
  vec2 dir = uv - 0.5;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float s = 1.0 - uWarp * 0.42 * float(i) / 13.0;
    acc += texture2D(tScene, 0.5 + dir * s).rgb;
  }
  vec3 col = acc / 14.0;
  if (uMotion > 0.002) {
    vec2 mdir = normalize(uMotionDir + vec2(1e-5)) / uRes;
    vec3 b = col * 0.52;
    b += texture2D(tScene, uv + mdir * (0.8 + uMotion * 2.6)).rgb * 0.24;
    b += texture2D(tScene, uv - mdir * (0.8 + uMotion * 2.6)).rgb * 0.24;
    col = mix(col, b, clamp(uMotion, 0.0, 0.35));
  }
  return col;
}

vec3 sceneB(vec2 uv) {
  if (uWarp < 0.002) return texture2D(tSceneB, uv).rgb;
  vec2 dir = uv - 0.5;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float s = 1.0 - uWarp * 0.42 * float(i) / 13.0;
    acc += texture2D(tSceneB, 0.5 + dir * s).rgb;
  }
  vec3 col = acc / 14.0;
  if (uMotion > 0.002) {
    vec2 mdir = normalize(uMotionDir + vec2(1e-5)) / uRes;
    vec3 b = col * 0.52;
    b += texture2D(tSceneB, uv + mdir * (0.8 + uMotion * 2.6)).rgb * 0.24;
    b += texture2D(tSceneB, uv - mdir * (0.8 + uMotion * 2.6)).rgb * 0.24;
    col = mix(col, b, clamp(uMotion, 0.0, 0.35));
  }
  return col;
}

void main() {
  vec2 frag = vUv * uRes;
  vec3 colA;
  vec3 colB;
  if (uLensOn < 0.5) {
    colA = sceneA(vUv);
    colB = sceneB(vUv);
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
    vec2 n = normalize(d + 1e-4);
    float ca = 0.006 * (1.0 - uMerge) * r * r;
    colA = vec3(sceneA(uv + n * ca).r, sceneA(uv).g, sceneA(uv - n * ca).b);
    colB = vec3(sceneB(uv + n * ca).r, sceneB(uv).g, sceneB(uv - n * ca).b);
    float inside = 1.0 - smoothstep(0.93, 1.0, r);
    colA *= inside * mix(1.0, 1.0 - 0.45 * r * r, 1.0 - uMerge);
    colB *= inside * mix(1.0, 1.0 - 0.45 * r * r, 1.0 - uMerge);
    float rim = smoothstep(0.9, 0.985, r) * (1.0 - smoothstep(0.985, 1.03, r));
    vec3 rimCol = uAccent * rim * 0.35 * (1.0 - uMerge) * uOpen;
    colA += rimCol;
    colB += rimCol;
  }
  vec3 col = mix(colA, colB, uMix);
  col = mix(col, vec3(3.0), uFlash);
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  col *= 1.0 - uFade;
  float g = fract(sin(dot(frag + fract(uTime) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.009 * (1.0 - uFade);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Stage {
  constructor(canvas, { accent = '#ff7847', maxDpr = 1.75 } = {}) {
    this.canvas = canvas;
    this.maxDpr = maxDpr;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    this.targetA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.targetB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });

    this.uniforms = {
      tScene: { value: this.targetA.texture },
      tSceneB: { value: this.targetB.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMix: { value: 0 },
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
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, depthTest: false, depthWrite: false }),
    );
    quad.frustumCulled = false;
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
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.targetA.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    this.targetB.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    this.uniforms.uRes.value.set(Math.floor(w * dpr), Math.floor(h * dpr));
    this.aspect = w / h;
  }

  render(scene, camera, exposure = 1) {
    this.renderBlend(scene, camera, exposure, null, null, exposure, 0);
  }

  renderBlend(sceneA, cameraA, exposureA, sceneB, cameraB, exposureB = exposureA, mix = 0) {
    const r = this.renderer;
    r.toneMappingExposure = exposureA;
    r.setRenderTarget(this.targetA);
    r.render(sceneA, cameraA);

    if (sceneB && cameraB && mix > 0.001) {
      r.toneMappingExposure = exposureB;
      r.setRenderTarget(this.targetB);
      r.render(sceneB, cameraB);
      this.uniforms.uMix.value = mix;
    } else {
      this.uniforms.uMix.value = 0;
    }

    r.setRenderTarget(null);
    r.render(this.post, this.postCam);
  }
}
