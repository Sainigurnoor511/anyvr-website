import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@phosphor-icons/web/duotone';
import Lenis from 'lenis';
import gsap from 'gsap';
import { siBlender, siFlutter, siGoogle, siPython, siTensorflow, siUnity } from 'simple-icons/icons';
import { createLobby } from './three/lobby.js';
import { Stage } from './three/stage.js';
import { createStudio } from './three/studio.js';
import './styles.css';

const accent = '#ff7847';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (p, a, b) => clamp((p - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

const canvas = document.querySelector('#gl');
const story = document.querySelector('#story');
const nav = document.querySelector('[data-nav]');
const stage = new Stage(canvas, { accent });

const controllers = {
  studio: createStudio(stage.renderer, accent),
  lobby: createLobby(stage.renderer, accent),
  taj: null,
  eiffel: null,
  giza: null,
};

const sceneLoaders = {
  taj: () => import('./three/taj.js').then((m) => m.createTaj(stage.renderer)),
  eiffel: () => import('./three/eiffel.js').then((m) => m.createEiffel(stage.renderer)),
  giza: () => import('./three/giza.js').then((m) => m.createGiza(stage.renderer)),
};

const sceneLoadState = { taj: null, eiffel: null, giza: null };

const pins = {
  home: document.querySelector('[data-pin="home"]'),
  agra: document.querySelector('[data-pin="agra"]'),
  paris: document.querySelector('[data-pin="paris"]'),
  giza: document.querySelector('[data-pin="giza"]'),
};

const storyPhases = [
  { start: 0, end: 0.37, key: 'studio' },
  { start: 0.37, end: 0.56, key: 'lobby' },
  { start: 0.56, end: 0.7, key: 'taj' },
  { start: 0.7, end: 0.84, key: 'eiffel' },
  { start: 0.84, end: 0.97, key: 'giza' },
];

const CROSSFADE = 0.02;

function getController(key) {
  return controllers[key] || controllers.lobby;
}

function ensureScene(key) {
  if (!sceneLoaders[key]) return Promise.resolve(getController(key));
  if (controllers[key]) return Promise.resolve(controllers[key]);
  if (sceneLoadState[key]) return sceneLoadState[key];
  sceneLoadState[key] = sceneLoaders[key]().then((controller) => {
    controllers[key] = controller;
    controller.resize(stage.aspect);
    return controller;
  });
  return sceneLoadState[key];
}

const showEls = [...document.querySelectorAll('[data-show]')].map((el) => {
  const [a, b] = (el.getAttribute('data-show') || '-1,-1').split(',').map(Number);
  return { el, a, b, alpha: -1 };
});
const tripEls = [...document.querySelectorAll('[data-trip]')].map((el) => ({ el, at: Number(el.getAttribute('data-trip')) }));

function setOpacityByRange(p) {
  showEls.forEach((entry) => {
    const { el, a, b } = entry;
    const t = smooth(range(p, a, b));
    const entering = range(p, a, a + 0.015);
    const leaving = 1 - range(p, b - 0.02, b + 0.02);
    const alpha = clamp(Math.min(Math.max(t, entering), leaving));
    if (Math.abs(alpha - entry.alpha) < 0.004) return;
    entry.alpha = alpha;
    el.style.opacity = `${alpha}`;
    el.style.transform = `translate3d(0, ${(1 - alpha) * 16}px, 0)`;
    el.style.filter = `blur(${(1 - alpha) * 2.2}px)`;
    el.style.pointerEvents = alpha > 0.35 ? 'auto' : 'none';
  });

  tripEls.forEach(({ el, at }) => {
    el.classList.toggle('is-active', Math.abs(p - at) < 0.04);
  });
}

function setPins(p) {
  if (p > 0.16) {
    Object.values(pins).forEach((el) => el?.classList.remove('is-visible'));
    return;
  }
  for (const key of Object.keys(pins)) {
    const el = pins[key];
    if (!el) continue;
    const pos = controllers.studio.project(key);
    el.style.left = `${pos.x * 100}%`;
    el.style.top = `${pos.y * 100}%`;
    el.classList.toggle('is-visible', pos.visible);
  }
}

let storyStart = 0;
let storyRange = 1;

function measureStory() {
  storyStart = story.offsetTop;
  storyRange = Math.max(story.offsetHeight - window.innerHeight, 1);
}

function storyProgress() {
  return clamp((window.scrollY - storyStart) / storyRange);
}

function phaseAt(p) {
  const phase = storyPhases.find((s) => p >= s.start && p < s.end) || storyPhases.at(-1);
  const local = range(p, phase.start, phase.end);
  return { phase, local };
}

function phaseBlend(p) {
  const { phase } = phaseAt(p);
  const i = storyPhases.indexOf(phase);
  const outMix = range(p, phase.end - CROSSFADE, phase.end + CROSSFADE);
  if (i < storyPhases.length - 1 && outMix > 0) {
    return { from: phase, to: storyPhases[i + 1], mix: outMix };
  }
  if (i > 0) {
    const prev = storyPhases[i - 1];
    const inMix = range(p, prev.end - CROSSFADE, prev.end + CROSSFADE);
    if (inMix > 0 && p <= prev.end + CROSSFADE) return { from: prev, to: phase, mix: inMix };
  }
  return { from: phase, to: null, mix: 0 };
}

function updateControllerForPhase(controller, phase, p, now, pick) {
  if (phase.key === 'studio') {
    controller.update(p, now, pick);
    return;
  }
  const local = range(p, phase.start, phase.end);
  controller.update(local, now, pick);
}

function applyPostFx(p) {
  const u = stage.uniforms;
  const lensIn = smooth(range(p, 0.335, 0.42));
  const lensOut = 1 - smooth(range(p, 0.94, 0.985));
  u.uLensOn.value = lensIn > 0.02 || p > 0.42 ? 1 : 0;
  u.uOpen.value = clamp(lensIn * lensOut);
  u.uMerge.value = smooth(range(p, 0.475, 0.56));

  const warpA = Math.sin(Math.PI * range(p, 0.555, 0.585));
  const warpB = Math.sin(Math.PI * range(p, 0.695, 0.725));
  const warpC = Math.sin(Math.PI * range(p, 0.835, 0.865));
  const warp = Math.max(0, warpA, warpB, warpC);
  u.uWarp.value = warp * 0.58;
  u.uFlash.value = Math.pow(warp, 2) * 0.32;
  u.uFade.value = smooth(range(p, 0.985, 1));
}

function currentGuideMonument(p) {
  if (p < 0.71) return 'taj';
  if (p < 0.845) return 'eiffel';
  return 'giza';
}

const guideData = {
  taj: {
    where: 'At the Taj Mahal',
    hello: { en: 'Welcome to the Taj Mahal.', hi: 'ताजमहल में आपका स्वागत है।', fr: 'Bienvenue au Taj Mahal.', ar: 'مرحبا بك في تاج محل.', es: 'Bienvenido al Taj Mahal.' },
    line: {
      story: 'Built as a love letter in marble, it changes color with the sky.',
      history: 'Construction began in 1632 and took around two decades.',
      friend: 'Stand by the pool. Best reflection spot right there.',
    },
  },
  eiffel: {
    where: 'At the Eiffel Tower',
    hello: { en: 'Welcome to the Eiffel Tower.', hi: 'एफ़िल टावर में आपका स्वागत है।', fr: 'Bienvenue à la tour Eiffel.', ar: 'مرحبا بك في برج إيفل.', es: 'Bienvenido a la Torre Eiffel.' },
    line: {
      story: 'At dusk, Paris glows and the iron giant sparkles every hour.',
      history: 'It opened in 1889 with around 18,000 iron components.',
      friend: 'Look up from the base. The lattice pattern is wild from here.',
    },
  },
  giza: {
    where: 'At the Pyramids of Giza',
    hello: { en: 'Welcome to Giza.', hi: 'गीज़ा में आपका स्वागत है।', fr: 'Bienvenue à Gizeh.', ar: 'مرحبا بك في الجيزة.', es: 'Bienvenido a Guiza.' },
    line: {
      story: 'Wind, sun, and stone. These forms watched millennia pass.',
      history: 'Khufu remained the tallest man-made structure for nearly 3,800 years.',
      friend: 'Shift left and you can frame all three pyramids together.',
    },
  },
};

const form = document.querySelector('[data-guide-form]');
const meta = document.querySelector('[data-guide-meta]');
const hello = document.querySelector('[data-guide-hello]');
const line = document.querySelector('[data-guide-line]');
const where = document.querySelector('.guide-where');

let guideState = { persona: 'story', lang: 'en', voice: 'warm' };
let scrollVelocity = 0;

function updateGuideCopy(p) {
  const monument = currentGuideMonument(p);
  const data = guideData[monument];
  if (!data) return;
  meta.textContent = `${labelPersona(guideState.persona)}, ${guideState.voice} voice`;
  where.textContent = data.where;
  hello.textContent = data.hello[guideState.lang] || data.hello.en;
  line.textContent = data.line[guideState.persona] || data.line.story;
}

function labelPersona(persona) {
  if (persona === 'history') return 'Historian';
  if (persona === 'friend') return 'Friend';
  return 'Storyteller';
}

form?.addEventListener('change', () => {
  const fd = new FormData(form);
  guideState = {
    persona: fd.get('persona') || 'story',
    lang: fd.get('lang') || 'en',
    voice: fd.get('voice') || 'warm',
  };
  updateGuideCopy(renderP);
});

function buildLogos() {
  const list = document.querySelector('[data-logos]');
  if (!list) return;
  const items = [
    ['Flutter', siFlutter],
    ['OpenVR', siUnity],
    ['Google VR', siGoogle],
    ['Unity', siUnity],
    ['Blender', siBlender],
    ['Python', siPython],
    ['TensorFlow', siTensorflow],
    ['OpenXR', siUnity],
  ];
  list.innerHTML = items.map(([name, icon]) => (
    `<li><span class="logo-icon" aria-hidden="true" style="--logo:${icon.hex};">${icon.svg}</span><span>${name}</span></li>`
  )).join('');
}

function bindReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-in');
    });
  }, { threshold: 0.18 });
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
}

function render(nowMs) {
  const now = nowMs * 0.001;
  const dt = Math.min(0.05, Math.max(0.001, now - lastNow));
  lastNow = now;

  targetP = storyProgress();
  renderP = damp(renderP, targetP, 14, dt);
  if (renderP > 0.48) ensureScene('taj');
  if (renderP > 0.64) ensureScene('eiffel');
  if (renderP > 0.79) ensureScene('giza');

  setOpacityByRange(renderP);
  setPins(renderP);
  updateGuideCopy(renderP);
  applyPostFx(renderP);

  const pick = smooth(range(renderP, 0.475, 0.535));
  const blendState = phaseBlend(renderP);
  const fromController = getController(blendState.from.key);
  updateControllerForPhase(fromController, blendState.from, renderP, now, pick);

  let toController = null;
  if (blendState.to && blendState.mix > 0.001) {
    toController = getController(blendState.to.key);
    updateControllerForPhase(toController, blendState.to, renderP, now, pick);
  }

  const blurStrength = clamp(Math.abs(scrollVelocity) / 1800, 0, 0.3);
  stage.uniforms.uMotion.value = damp(stage.uniforms.uMotion.value, blurStrength, 9, dt);
  stage.uniforms.uMotionDir.value.set(0, scrollVelocity >= 0 ? 1 : -1);
  stage.uniforms.uTime.value = now;
  stage.renderBlend(
    fromController.scene,
    fromController.camera,
    fromController.exposure,
    toController?.scene,
    toController?.camera,
    toController?.exposure,
    blendState.mix,
  );

  nav.classList.toggle('is-solid', window.scrollY > 24);
  requestAnimationFrame(render);
}

const lenis = new Lenis({
  smoothWheel: true,
  wheelMultiplier: 0.86,
  touchMultiplier: 1.15,
  lerp: 0.065,
});
lenis.on('scroll', (e) => {
  scrollVelocity = e.velocity || 0;
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

window.addEventListener('resize', () => {
  stage.resize();
  measureStory();
  Object.values(controllers).forEach((c) => c?.resize(stage.aspect));
});

document.querySelectorAll('[data-scroll-to]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = Number(btn.getAttribute('data-scroll-to'));
    const top = story.offsetTop + target * Math.max(story.offsetHeight - window.innerHeight, 1);
    lenis.scrollTo(top, { duration: 1.3, easing: (x) => 1 - Math.pow(1 - x, 4) });
  });
});

document.querySelector('[data-pick]')?.addEventListener('mouseenter', () => {
  gsap.fromTo('.hud-guide .orb', { scale: 1 }, { scale: 1.18, yoyo: true, repeat: 1, duration: 0.24, ease: 'power2.out' });
});

stage.resize();
measureStory();
Object.values(controllers).forEach((c) => c?.resize(stage.aspect));
ensureScene('taj');
buildLogos();
bindReveal();
requestAnimationFrame(render);

let targetP = storyProgress();
let renderP = targetP;
let lastNow = 0;
