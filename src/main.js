import './styles.css';

document.documentElement.classList.add('js');
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = document.querySelector('[data-motion]');
let reduced = preference.matches;
let experience;

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
document.querySelectorAll('main > section[id]').forEach((section) => spy.observe(section));

const guide = {
  taj: {
    name: 'Taj Mahal',
    en: ['Welcome to the Taj Mahal.', 'Imagine arriving at first light. The marble catches the morning sun, and the monument seems to change before your eyes.', 'Commissioned by Shah Jahan in 1632, the Taj Mahal was built in memory of Mumtaz Mahal. The wider complex took around two decades to complete.', 'Try looking from the reflecting pool. The garden brings everything into balance, and the reflection gives you a second view.'],
    hi: ['ताजमहल में आपका स्वागत है।', 'सुबह की पहली रोशनी में आने की कल्पना करें। सूरज की किरणें संगमरमर पर पड़ती हैं और इमारत का रंग बदलता हुआ लगता है।', 'शाहजहाँ ने मुमताज़ महल की याद में 1632 में ताजमहल का निर्माण शुरू करवाया। पूरे परिसर को बनने में लगभग दो दशक लगे।', 'सामने के तालाब से देखिए। बगीचे की सममिति और पानी में प्रतिबिंब इस जगह को एक नया नज़रिया देते हैं।'],
    fr: ['Bienvenue au Taj Mahal.', 'Imaginez arriver aux premières lueurs du jour. Le marbre capte le soleil et le monument semble changer sous vos yeux.', 'Commandé par Shah Jahan en 1632 en mémoire de Mumtaz Mahal, le complexe du Taj Mahal a demandé environ deux décennies de travaux.', 'Regardez depuis le bassin. La symétrie du jardin et le reflet dans l’eau offrent une autre perspective.'],
  },
  eiffel: {
    name: 'Eiffel Tower',
    en: ['Welcome to the Eiffel Tower.', 'From below, thousands of iron pieces become a delicate pattern against the sky. A feat of engineering becomes a different kind of landscape.', 'The Eiffel Tower opened for the 1889 World’s Fair. Its structure uses about 18,000 iron components and 2.5 million rivets.', 'Look straight up from the base. All those diagonal beams make much more sense when you can see how they fit together.'],
    hi: ['एफ़िल टावर में आपका स्वागत है।', 'नीचे से देखने पर लोहे के हज़ारों हिस्से आसमान के सामने एक सुंदर जाल बनाते हैं। इंजीनियरिंग भी एक अनोखा दृश्य बन सकती है।', 'एफ़िल टावर 1889 के विश्व मेले के लिए खोला गया था। इसमें लगभग 18,000 लोहे के हिस्से और 25 लाख रिवेट हैं।', 'टावर के नीचे से ऊपर देखिए। तिरछी बीम किस तरह जुड़ती हैं, यह इस नज़रिए से साफ़ दिखता है।'],
    fr: ['Bienvenue à la tour Eiffel.', 'Vue d’en bas, la structure de fer dessine un motif délicat dans le ciel. Une prouesse technique devient un paysage à part entière.', 'La tour Eiffel a ouvert pour l’Exposition universelle de 1889. Elle comporte environ 18 000 pièces de fer et 2,5 millions de rivets.', 'Regardez tout droit vers le sommet depuis la base. On comprend mieux comment les poutres diagonales s’assemblent.'],
  },
  giza: {
    name: 'Pyramids of Giza',
    en: ['Welcome to Giza.', 'Wind moves across the plateau. Beyond it, these immense stone forms have watched more than four thousand years of history unfold.', 'The Great Pyramid was built for Khufu in the 26th century BCE. It remained the tallest human-made structure for roughly 3,800 years.', 'Take a wider view. Seeing the pyramids together helps you understand just how much of the plateau they occupy.'],
    hi: ['गीज़ा में आपका स्वागत है।', 'पठार पर हवा बहती है। पत्थर की इन विशाल आकृतियों ने चार हज़ार से अधिक वर्षों का इतिहास देखा है।', 'महान पिरामिड खुफू के लिए ईसा पूर्व 26वीं शताब्दी में बनाया गया था। यह लगभग 3,800 वर्षों तक सबसे ऊँची मानव-निर्मित संरचना रहा।', 'थोड़ा दूर से देखिए। पिरामिडों को एक साथ देखने पर उनके विशाल आकार का बेहतर अंदाज़ा होता है।'],
    fr: ['Bienvenue à Gizeh.', 'Le vent traverse le plateau. Ces immenses formes de pierre ont vu se dérouler plus de quatre mille ans d’histoire.', 'La Grande Pyramide a été construite pour Khéops au XXVIe siècle avant notre ère. Elle est restée la plus haute construction humaine pendant environ 3 800 ans.', 'Prenez du recul. Voir les pyramides ensemble permet de mieux comprendre la place qu’elles occupent sur le plateau.'],
  },
};
const form = document.querySelector('[data-guide-form]');
const response = document.querySelector('.guide-response');
const hello = document.querySelector('[data-guide-hello]');
const line = document.querySelector('[data-guide-line]');
const audioButton = document.querySelector('[data-speak]');
const audioStatus = document.querySelector('[data-audio-status]');
const synth = window.speechSynthesis;
const PLAY_ICON = '<svg class="ico-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.8v8.4l6.6-4.2z"/></svg>';
const STOP_ICON = '<svg class="ico-play" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.2"/></svg>';
let guideLang = 'en';
let speaking = false;
let speechVersion = 0;

function stopAudio() {
  speechVersion++;
  synth?.cancel();
  speaking = false;
  audioButton.innerHTML = `Listen ${PLAY_ICON}`;
}
function updateVoiceAvailability() {
  audioButton.hidden = !synth;
  if (!synth) return;
  const available = synth.getVoices().some((voice) => voice.lang.toLowerCase().startsWith(guideLang));
  audioButton.disabled = !available;
  audioStatus.textContent = available ? '' : 'No voice for this language is installed in your browser.';
}
function updateGuide() {
  stopAudio();
  const values = new FormData(form);
  const place = guide[values.get('place')];
  guideLang = values.get('lang');
  const persona = values.get('persona');
  const phrases = place[guideLang];
  response.lang = guideLang;
  document.querySelector('[data-guide-where]').textContent = place.name;
  hello.textContent = phrases[0];
  line.textContent = phrases[{ story: 1, history: 2, friend: 3 }[persona]];
  document.querySelector('[data-guide-meta]').textContent = `${{ story: 'Storyteller', history: 'Historian', friend: 'Friend' }[persona]} · ${{ en: 'English', hi: 'Hindi', fr: 'French' }[guideLang]}`;
  updateVoiceAvailability();
}
form.addEventListener('change', updateGuide);
synth?.addEventListener('voiceschanged', updateVoiceAvailability);
audioButton.addEventListener('click', () => {
  if (speaking) { stopAudio(); return; }
  const utterance = new SpeechSynthesisUtterance(`${hello.textContent} ${line.textContent}`);
  utterance.voice = synth.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(guideLang));
  utterance.lang = guideLang;
  utterance.rate = 0.92;
  const version = ++speechVersion;
  speaking = true;
  audioButton.innerHTML = `Stop audio ${STOP_ICON}`;
  utterance.onend = () => { if (version === speechVersion) stopAudio(); };
  utterance.onerror = () => {
    if (version !== speechVersion) return;
    stopAudio();
    audioStatus.textContent = 'Audio could not play. You can still read the story above.';
  };
  synth.speak(utterance);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
updateGuide();

document.querySelectorAll('[data-scroll-to]').forEach((button) => {
  button.addEventListener('click', () => {
    if (experience && !reduced) experience.seek(Number(button.dataset.scrollTo), button);
    else document.querySelector('#destinations').scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' });
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
import('./experience.js').then(async ({ initExperience }) => {
  experience = await initExperience({ reduced, onStatus(message) {
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
