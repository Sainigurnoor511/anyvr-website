import './styles.css';
import { guide } from './guide-data.js';

document.documentElement.classList.add('js');

const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = document.querySelector('[data-motion]');
let reduced = preference.matches;
let experience;
const themeMeta = document.querySelector('meta[name="theme-color"]');
const themeButtons = [...document.querySelectorAll('[data-theme-toggle]')];
function applyTheme(theme, remember) {
  document.documentElement.dataset.theme = theme;
  themeMeta.content = theme === 'light' ? '#f6f5f2' : '#0a0b0e';
  const next = theme === 'light' ? 'dark' : 'light';
  themeButtons.forEach((button) => button.setAttribute('aria-label', `Switch to ${next} mode`));
  if (remember) { try { localStorage.setItem('anyvr-theme', theme); } catch { /* storage blocked */ } }
  experience?.setTheme(theme);
}
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
themeButtons.forEach((button) => button.addEventListener('click', () => {
  const swap = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  // cross-fade the whole page, canvas included, so the brightness never jumps
  if (document.startViewTransition && !reduced) document.startViewTransition(swap);
  else swap();
}));
matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
  let saved = null;
  try { saved = localStorage.getItem('anyvr-theme'); } catch { /* storage blocked */ }
  if (!saved) applyTheme(event.matches ? 'light' : 'dark', false);
});

function setMotion(value) {
  reduced = value;
  experience?.setReducedMotion(reduced);
  document.body.classList.toggle('reduced-motion', reduced);
  motionButton.setAttribute('aria-pressed', String(reduced));
  motionButton.textContent = reduced ? 'Enable motion' : 'Reduce motion';
}
setMotion(reduced);
motionButton.addEventListener('click', () => setMotion(!reduced));
preference.addEventListener('change', (event) => setMotion(event.matches));

const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.nav-links');
function closeMenu() {
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open menu');
  navigation.classList.remove('is-open');
}
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  navigation.classList.toggle('is-open', open);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menu.focus();
  }
});
navigation.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
window.matchMedia('(min-width: 768px)').addEventListener('change', closeMenu);

const reveals = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-in');
      reveals.unobserve(entry.target);
    }
  }
}, { threshold: 0.1 });
document.querySelectorAll('[data-reveal]').forEach((el) => reveals.observe(el));

// highlight the nav link for the section in view
const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
const spy = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    navLinks.forEach((link) => link.setAttribute('aria-current', String(link.getAttribute('href') === `#${entry.target.id}`)));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section[id]').forEach((section) => spy.observe(section));

const form = document.querySelector('[data-guide-form]');
const response = document.querySelector('.guide-response');
const hello = document.querySelector('[data-guide-hello]');
const line = document.querySelector('[data-guide-line]');
const audioButton = document.querySelector('[data-speak]');
const audioStatus = document.querySelector('[data-audio-status]');
const synth = window.speechSynthesis;
const PLAY_ICON = '<svg class="ico-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.8v8.4l6.6-4.2z"/></svg>';
const STOP_ICON = '<svg class="ico-play" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.2"/></svg>';
const fishCache = new Map();
let guideLang = 'en';
let guidePersona = 'story';
let speaking = false;
let speechVersion = 0;
let player = null;

function stopAudio() {
  speechVersion++;
  synth?.cancel();
  if (player) { player.pause(); player = null; }
  speaking = false;
  audioButton.innerHTML = `Listen ${PLAY_ICON}`;
}
function updateVoiceAvailability() {
  audioButton.hidden = false;
  audioButton.disabled = false;
  audioStatus.textContent = '';
}
async function fishAudio(text) {
  const key = `${guidePersona}|${text}`;
  if (fishCache.has(key)) return fishCache.get(key);
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang: guideLang, persona: guidePersona }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  fishCache.set(key, url);
  return url;
}
function speakWithBrowser(text, version) {
  const voice = synth?.getVoices().find((v) => v.lang.toLowerCase().startsWith(guideLang));
  if (!voice) {
    stopAudio();
    audioStatus.textContent = 'Audio is unavailable right now. You can still read the story above.';
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = guideLang;
  utterance.rate = 0.92;
  utterance.onend = () => { if (version === speechVersion) stopAudio(); };
  utterance.onerror = () => { if (version === speechVersion) stopAudio(); };
  audioStatus.textContent = 'Playing with your browser’s voice.';
  synth.speak(utterance);
}
function updateGuide() {
  stopAudio();
  const values = new FormData(form);
  const place = guide[values.get('place')];
  guideLang = values.get('lang');
  guidePersona = values.get('persona');
  const phrases = place[guideLang];
  response.lang = guideLang;
  document.querySelector('[data-guide-where]').textContent = place.name;
  hello.textContent = phrases[0];
  line.textContent = phrases[{ story: 1, history: 2, friend: 3 }[guidePersona]];
  document.querySelector('[data-guide-meta]').textContent = `${{ story: 'Storyteller', history: 'Historian', friend: 'Friend' }[guidePersona]}, ${{ en: 'English', hi: 'Hindi', fr: 'French' }[guideLang]}`;
  updateVoiceAvailability();
}
form.addEventListener('change', updateGuide);
audioButton.addEventListener('click', async () => {
  if (speaking) { stopAudio(); return; }
  const text = `${hello.textContent} ${line.textContent}`;
  const version = ++speechVersion;
  speaking = true;
  audioButton.innerHTML = `Stop audio ${STOP_ICON}`;
  audioStatus.textContent = 'Preparing the voice...';
  try {
    const url = await fishAudio(text);
    if (version !== speechVersion) return;
    player = new Audio(url);
    player.onended = () => { if (version === speechVersion) stopAudio(); };
    await player.play();
    audioStatus.textContent = 'Voice by Fish Audio.';
  } catch {
    if (version === speechVersion) speakWithBrowser(text, version);
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });

const logoDialog = document.querySelector('[data-logo-dialog]');
document.querySelectorAll('[data-logo-open]').forEach((button) => button.addEventListener('click', () => {
  logoDialog.showModal();
  const from = button.getBoundingClientRect();
  logoDialog.style.transformOrigin = `${from.left + from.width / 2 - logoDialog.offsetLeft}px ${from.top + from.height / 2 - logoDialog.offsetTop}px`;
}));
document.querySelector('[data-logo-close]').addEventListener('click', () => logoDialog.close());
logoDialog.addEventListener('click', (event) => { if (event.target === logoDialog) logoDialog.close(); });
updateGuide();

const waitlist = document.querySelector('[data-waitlist]');
const waitlistEmail = waitlist.querySelector('input[name="email"]');
const waitlistMsg = waitlist.querySelector('[data-waitlist-msg]');
const waitlistSubmit = waitlist.querySelector('[data-waitlist-submit]');
const waitlistDone = document.querySelector('[data-waitlist-done]');
function waitlistError(message) {
  waitlistMsg.textContent = message;
  waitlistMsg.classList.toggle('is-error', !!message);
  waitlistEmail.toggleAttribute('aria-invalid', !!message);
}
waitlistEmail.addEventListener('input', () => { if (waitlistEmail.hasAttribute('aria-invalid')) waitlistError(''); });
waitlist.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!waitlistEmail.checkValidity()) {
    waitlistError(waitlistEmail.value.trim() ? 'That email address does not look right.' : 'Enter your email address.');
    waitlistEmail.focus();
    return;
  }
  const data = Object.fromEntries(new FormData(waitlist));
  waitlistError('');
  waitlistSubmit.disabled = true;
  waitlistSubmit.textContent = 'Joining...';
  try {
    const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    if (body.result === 'already') {
      waitlistDone.querySelector('[data-waitlist-title]').textContent = 'You are already on the list.';
      waitlistDone.querySelector('[data-waitlist-text]').textContent = `We have ${data.email.trim()} saved. We will write when AnyVR opens.`;
    } else {
      waitlistDone.querySelector('[data-waitlist-text]').textContent = `We will write to ${data.email.trim()} when AnyVR opens.`;
    }
    waitlist.hidden = true;
    waitlistDone.hidden = false;
    waitlistDone.focus({ preventScroll: true });
  } catch (error) {
    waitlistError(error instanceof TypeError ? 'You seem to be offline. Please try again.' : error.message);
  } finally {
    waitlistSubmit.disabled = false;
    waitlistSubmit.textContent = 'Join the list';
  }
});

document.querySelectorAll('[data-scroll-to]').forEach((button) => {
  button.addEventListener('click', () => {
    if (experience && !reduced) { experience.seek(Number(button.dataset.scrollTo), button); return; }
    const card = document.querySelector(`.destination [data-scroll-to="${button.dataset.scrollTo}"]`)?.closest('.destination');
    (card || document.querySelector('#destinations')).scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: card ? 'center' : 'start' });
  });
});
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target || !experience) return;
    event.preventDefault();
    experience.navigate(target);
    history.replaceState(null, '', link.getAttribute('href'));
  });
});
const status = document.querySelector('[data-scene-status]');
// the 3D bundle is only fetched when the flag is on
if (document.documentElement.dataset.tour3d === 'on') import('./experience.js').then(async ({ initExperience }) => {
  experience = await initExperience({ reduced, theme: document.documentElement.dataset.theme, onStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  } });
  experience.setReducedMotion(reduced);
}).catch((error) => {
  console.error('3D preview could not start:', error);
  document.body.classList.add('no-webgl');
  status.textContent = '3D is unavailable on this device. Explore the destinations below.';
  status.hidden = false;
});
