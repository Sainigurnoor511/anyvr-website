import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { Stage } from './three/stage.js';
import { createStudio } from './three/studio.js';
import { clamp, range, smooth } from './three/util.js';

export async function initExperience({ reduced = false, onStatus }) {
  const canvas = document.querySelector('#gl');
  const story = document.querySelector('#story');
  const stage = new Stage(canvas, { accent: '#e59a76', maxDpr: 2 });
  const studio = createStudio(stage.renderer, '#e59a76');
  const controllers = { studio };
  const promises = {};
  const failures = new Set();
  const loaders = {
    lobby: () => import('./three/lobby.js').then((m) => m.createLobby(stage.renderer, '#e59a76')),
    taj: () => import('./three/taj.js').then((m) => m.createTaj(stage.renderer)),
    eiffel: () => import('./three/eiffel.js').then((m) => m.createEiffel(stage.renderer)),
    giza: () => import('./three/giza.js').then((m) => m.createGiza(stage.renderer)),
  };
  const phases = [
    { key: 'studio', start: 0, end: .37, name: 'A different perspective' },
    { key: 'lobby', start: .37, end: .56, name: 'Choose your destination' },
    { key: 'taj', start: .56, end: .7, name: 'Taj Mahal / India' },
    { key: 'eiffel', start: .7, end: .84, name: 'Eiffel Tower / France' },
    { key: 'giza', start: .84, end: 1, name: 'Pyramids of Giza / Egypt' },
  ];
  const overlays = [...document.querySelectorAll('[data-show]')].map((el) => ({ el, limits: el.dataset.show.split(',').map(Number), alpha: -1 }));
  const pins = [...document.querySelectorAll('[data-pin]')];
  const chapterButtons = [...document.querySelectorAll('[data-chapter]')];
  const phaseLabel = document.querySelector('[data-tour-stage]');
  // a slower lerp and a second, gentler chase on the camera give the cinematic glide
  const lenis = new Lenis({ smoothWheel: !reduced, lerp: .075, wheelMultiplier: .85, anchors: false, syncTouch: false });
  document.body.classList.add('experience-ready');
  // dev-only handle so browser tests can jump to any story progress
  if (import.meta.env.DEV) window.__anyvr = { lenis, stage, go: (v) => lenis.scrollTo(storyTop + v * storyLength, { immediate: true, force: true }) };
  let storyTop = 0;
  let storyLength = 1;
  let lastTime = 0;
  let elapsed = 0;
  let p = 0;
  let velocity = 0;
  let frame = 0;
  let resizeFrame = 0;
  let lastPhase = '';
  let lastP = -1;
  let dirty = true;
  let inView = true;
  let lost = false;
  let lastStatus = '';
  let preloadScheduled = false;
  let seekVersion = 0;

  function status(message) {
    if (message === lastStatus) return;
    lastStatus = message;
    onStatus(message);
  }
  function measure() {
    stage.resize();
    Object.values(controllers).forEach((controller) => controller.resize(stage.aspect));
    storyTop = story.getBoundingClientRect().top + window.scrollY;
    storyLength = Math.max(1, story.offsetHeight - canvas.clientHeight);
    dirty = true;
  }
  async function load(key) {
    if (controllers[key]) return controllers[key];
    if (promises[key]) return promises[key];
    promises[key] = loaders[key]().then(async (controller) => {
      controller.resize(stage.aspect);
      controller.update(0, 0, 0);
      await stage.renderer.compileAsync(controller.scene, controller.camera);
      controllers[key] = controller;
      dirty = true;
      return controller;
    }).catch((error) => {
      failures.add(key);
      console.error(`Could not load ${key}:`, error);
      dirty = true;
      return null;
    });
    return promises[key];
  }
  function preload() {
    if (preloadScheduled || reduced || lost) return;
    preloadScheduled = true;
    const schedule = window.requestIdleCallback || ((callback) => setTimeout(callback, 80));
    let index = 1;
    const next = () => schedule(async () => {
      if (lost || reduced) { preloadScheduled = false; return; }
      await load(phases[index++].key);
      if (index < phases.length) next();
    }, { timeout: 1200 });
    next();
  }
  function updateOverlays(value) {
    for (const entry of overlays) {
      const [start, end] = entry.limits;
      const alpha = smooth(range(value, start, start + .013)) * (1 - smooth(range(value, end - .012, end + .008)));
      if (Math.abs(alpha - entry.alpha) < .002 && alpha !== 0 && alpha !== 1) continue;
      if (alpha === entry.alpha) continue;
      entry.alpha = alpha;
      entry.el.style.opacity = alpha;
      entry.el.style.setProperty('--reveal-y', `${(1 - alpha) * 12}px`);
      entry.el.style.visibility = alpha > .001 ? 'visible' : 'hidden';
      entry.el.style.pointerEvents = alpha > .5 ? 'auto' : 'none';
      entry.el.inert = alpha <= .5;
      if (!entry.el.classList.contains('pins')) entry.el.setAttribute('aria-hidden', String(alpha <= .001));
    }
  }
  function updateScene(phase, progress, time) {
    const controller = controllers[phase.key];
    controller.update(phase.key === 'studio' ? progress : range(progress, phase.start, phase.key === 'giza' ? .97 : phase.end), time, smooth(range(progress, .475, .535)));
    if (phase.key !== 'studio' && phase.key !== 'lobby' && !reduced) {
      controller.camera.rotateX(clamp(velocity / 900, -.012, .012));
    }
    return controller;
  }
  function draw(now) {
    frame = 0;
    if (document.hidden || lost) return;
    lenis.raf(now);
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!reduced) elapsed += dt;
    const target = reduced ? 0 : clamp((window.scrollY - storyTop) / storyLength);
    const next = reduced ? 0 : p + (target - p) * (1 - Math.exp(-9 * dt));
    const phase = phases.find((item) => next < item.end) || phases.at(-1);
    let ready = true;
    if (!controllers[phase.key]) {
      ready = false;
      load(phase.key);
      status(failures.has(phase.key) ? 'This scene could not load. Browse the destinations below.' : 'Preparing your destination...');
    } else status('');
    p = next;
    if (inView && (dirty || !reduced)) {
      const active = phases.find((item) => p < item.end) || phases.at(-1);
      let from = controllers[active.key] ? active : phases[0];
      let to = null;
      let mix = 0;
      if (!reduced && ready) {
        for (let i = 1; i < phases.length; i++) {
          const boundary = phases[i].start;
          if (p >= boundary - .014 && p <= boundary + .014 && controllers[phases[i].key] && controllers[phases[i - 1].key]) {
            from = phases[i - 1]; to = phases[i]; mix = smooth(range(p, boundary - .014, boundary + .014));
            break;
          }
        }
      }
      const a = updateScene(from, ready ? p : 0, elapsed);
      const b = to ? updateScene(to, p, elapsed) : null;
      const u = stage.uniforms;
      u.uLensOn.value = !reduced && ready && p >= .37 ? 1 : 0;
      u.uOpen.value = reduced ? 1 : smooth(range(p, .37, .423)) * (1 - smooth(range(p, .945, .99)));
      u.uMerge.value = smooth(range(p, .415, .465));
      const wearing = smooth(range(p, .34, .37)) * (1 - smooth(range(p, .37, .395)));
      u.uFade.value = !ready ? .65 : reduced ? 0 : Math.max(wearing, smooth(range(p, .98, 1)));
      u.uWarp.value = 0;
      u.uFlash.value = 0;
      // bloom is for suns and lit iron; on the white headset it would read as a halo
      u.uBloom.value = from.key === 'studio' ? .06 : from.key === 'lobby' ? .25 : .5;
      u.uMotion.value = reduced ? 0 : Math.min(Math.abs(velocity) / 100, .12);
      u.uMotionDir.value.set(0, Math.sign(velocity));
      stage.renderBlend(a.scene, a.camera, a.exposure, b?.scene, b?.camera, b?.exposure, mix);
      if (p !== lastP || dirty) {
        updateOverlays(ready ? p : -2);
        lastP = p;
      }
      if (p < .085 && !reduced) {
        for (const pin of pins) {
          const projected = studio.project(pin.dataset.pin);
          pin.style.transform = `translate3d(${projected.x * canvas.clientWidth}px, ${projected.y * canvas.clientHeight}px, 0) translate(-50%, -145%)`;
          pin.classList.toggle('is-visible', projected.visible);
        }
      }
      if (active.key !== lastPhase) {
        phaseLabel.textContent = active.name;
        for (const button of chapterButtons) {
          if (button.dataset.chapter === active.key) button.setAttribute('aria-current', 'step');
          else button.removeAttribute('aria-current');
        }
        lastPhase = active.key;
      }
      dirty = false;
    }
    frame = requestAnimationFrame(draw);
  }
  function resume() {
    if (!frame && !document.hidden && !lost) {
      lastTime = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    canvas.style.visibility = inView ? 'visible' : 'hidden';
    dirty = true;
  });
  observer.observe(story);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else resume();
  });
  lenis.on('scroll', (event) => { velocity = event.velocity || 0; });
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(measure);
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    seekVersion++;
    cancelAnimationFrame(frame);
    frame = 0;
    lenis.destroy();
    document.body.classList.add('no-webgl');
    updateOverlays(0);
    status('The 3D preview paused. Reload to try again, or browse the destinations below.');
  });
  measure();
  const initialHash = document.getElementById(location.hash.slice(1));
  if (initialHash && initialHash !== story && !story.contains(initialHash)) {
    lenis.resize();
    lenis.scrollTo(initialHash, { immediate: true });
  }
  p = reduced ? 0 : clamp((window.scrollY - storyTop) / storyLength);
  if (p > .35) { p = 0; }
  resume();
  requestAnimationFrame(() => requestAnimationFrame(preload));
  return {
    async seek(progress, origin) {
      const version = ++seekVersion;
      if (lost || reduced) { document.querySelector('#destinations').scrollIntoView(); return; }
      const phase = phases.find((item) => progress < item.end) || phases.at(-1);
      if (failures.has(phase.key)) { failures.delete(phase.key); delete promises[phase.key]; }
      if (!controllers[phase.key]) {
        status('Preparing your destination...');
        const loaded = await load(phase.key);
        if (version !== seekVersion || reduced || lost) return;
        if (!loaded) { status('This scene could not load. Try again or browse the images below.'); return; }
      }
      status('');
      lenis.scrollTo(storyTop + progress * storyLength, { duration: 1.4, onComplete() {
        if (version !== seekVersion) return;
        if (!origin?.closest('.tour-chapters')) chapterButtons.find((button) => button.dataset.chapter === phase.key)?.focus({ preventScroll: true });
      } });
    },
    navigate(target) {
      seekVersion++;
      const focus = () => {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      };
      if (lost) { target.scrollIntoView(); focus(); return; }
      lenis.scrollTo(target, { immediate: reduced, duration: 1.1, onComplete: focus });
    },
    setReducedMotion(value) {
      if (reduced === value) return;
      seekVersion++;
      const previousHeight = story.offsetHeight;
      const previousY = window.scrollY;
      const wasInTour = previousY < storyTop + previousHeight;
      reduced = value;
      document.body.classList.toggle('reduced-motion', value);
      lenis.options.smoothWheel = !value;
      p = 0;
      lastP = -1;
      measure();
      lenis.resize();
      preload();
      lenis.scrollTo(wasInTour ? storyTop : previousY + story.offsetHeight - previousHeight, { immediate: true, force: true });
      resume();
    },
  };
}
