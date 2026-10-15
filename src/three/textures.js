import * as THREE from 'three';

/**
 * Photo-scanned PBR texture sets (Poly Haven, CC0) applied with world-space
 * triplanar mapping. The monuments are built procedurally, so their UVs are
 * all over the place; projecting from world position keeps every surface at
 * the same real-world texel density, instanced beams included.
 */
const loader = new THREE.TextureLoader();
const cache = new Map();

function load(name, file, srgb) {
  const key = `${name}/${file}`;
  if (!cache.has(key)) {
    const t = loader.load(`/textures/${name}/${file}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    cache.set(key, t);
  }
  return cache.get(key);
}

/** The three maps of a texture set. */
export function pbr(name) {
  return { map: load(name, 'diffuse', true), normalMap: load(name, 'nor', false), roughnessMap: load(name, 'rough', false) };
}

let uid = 0;

/**
 * Turns a standard material's map, normalMap and roughnessMap into triplanar
 * projections. `scale` is tiles per metre; `macro` breaks up visible tiling
 * on large ground planes by modulating with a much larger second sample;
 * `saturation` and `gain` retune a scan's colour without editing the file.
 * Chains any existing onBeforeCompile (the Eiffel uplighting, for one).
 */
export function triplanar(material, { scale = 0.25, macro = 0, normalScale = 1, saturation = 1, gain = 1 } = {}) {
  const previous = material.onBeforeCompile;
  const id = `tri-${uid++}`;
  material.normalScale = new THREE.Vector2(normalScale, normalScale);
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uTriScale = { value: scale };
    shader.uniforms.uTriMacro = { value: macro };
    shader.uniforms.uTriSat = { value: saturation };
    shader.uniforms.uTriGain = { value: gain };
    shader.vertexShader = 'varying vec3 vTriPos;\nvarying vec3 vTriNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 triWorld = vec4(transformed, 1.0);
      vec3 triNormal = objectNormal;
      #ifdef USE_INSTANCING
        triWorld = instanceMatrix * triWorld;
        triNormal = mat3(instanceMatrix) * triNormal;
      #endif
      vTriPos = (modelMatrix * triWorld).xyz;
      vTriNormal = normalize(mat3(modelMatrix) * triNormal);
    `);
    shader.fragmentShader = `
      varying vec3 vTriPos;
      varying vec3 vTriNormal;
      uniform float uTriScale;
      uniform float uTriMacro;
      uniform float uTriSat;
      uniform float uTriGain;
      vec3 triWeights(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
      vec4 triSample(sampler2D tex, vec3 p, vec3 w) {
        return texture2D(tex, p.zy) * w.x + texture2D(tex, p.xz) * w.y + texture2D(tex, p.xy) * w.z;
      }
    ` + shader.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 triW = triWeights(normalize(vTriNormal));
        vec3 triP = vTriPos * uTriScale;
        #ifdef USE_MAP
          vec4 triColor = triSample(map, triP, triW);
          if (uTriMacro > 0.0) {
            // a second sample at an unrelated scale hides the tile grid at distance
            triColor = mix(triColor, triSample(map, triP * 0.37 + 0.61, triW), 0.5);
            vec3 macroTone = triSample(map, triP * 0.083 + 0.37, triW).rgb;
            triColor.rgb *= mix(vec3(1.0), macroTone / max(dot(macroTone, vec3(0.333)), 0.05), uTriMacro);
          }
          // pull a scan toward its own luminance (white marble from a warm scan)
          triColor.rgb = mix(vec3(dot(triColor.rgb, vec3(0.2126, 0.7152, 0.0722))), triColor.rgb, uTriSat) * uTriGain;
          diffuseColor *= triColor;
        #endif
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor *= triSample(roughnessMap, triP, triW).g;
        #endif
      `)
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
        {
          // whiteout blend of three tangent-space samples, rebuilt in world space
          vec3 N = normalize(vTriNormal);
          vec3 tx = texture2D(normalMap, triP.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(normalMap, triP.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(normalMap, triP.xy).xyz * 2.0 - 1.0;
          tx.xy *= normalScale; ty.xy *= normalScale; tz.xy *= normalScale;
          vec3 nx = vec3(tx.xy + N.zy, abs(tx.z) * N.x);
          vec3 ny = vec3(ty.xy + N.xz, abs(ty.z) * N.y);
          vec3 nz = vec3(tz.xy + N.xy, abs(tz.z) * N.z);
          vec3 worldN = normalize(nx.zyx * triW.x + ny.xzy * triW.y + nz.xyz * triW.z);
          normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
          #ifdef DOUBLE_SIDED
            normal *= faceDirection;
          #endif
        }
        #endif
      `);
    previous?.call(material, shader, renderer);
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${id}|${previousKey ? previousKey() : ''}`;
  material.needsUpdate = true;
  return material;
}

/** A textured, triplanar-mapped standard material in one call. */
export function scanned(name, params = {}, options = {}) {
  return triplanar(new THREE.MeshStandardMaterial({ ...pbr(name), ...params }), options);
}
