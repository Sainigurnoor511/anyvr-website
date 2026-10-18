import { guide } from '../src/guide-data.js';

/**
 * Text-to-speech through Fish Audio, kept on the server so the API key never
 * reaches the browser. It only speaks the guide's own lines (the greeting
 * followed by one of the three styles), so the endpoint cannot be used as a
 * free general-purpose TTS service on your key. Each style gets its own voice
 * per language and its own delivery through Fish's S2 bracket cues.
 */
const LINES = new Map();
for (const place of Object.values(guide)) {
  for (const lang of ['en', 'hi', 'fr']) {
    const [hello, ...lines] = place[lang];
    lines.forEach((line, i) => LINES.set(`${hello} ${line}`, { hello, line, lang, persona: ['story', 'history', 'friend'][i] }));
  }
}

/** Default voices from the Fish Audio library, picked by their narration and conversational tags; override any with FISH_VOICE_<STYLE>_<LANG>. */
const VOICES = {
  story: { en: '5c8dc6a69c0b4edfb32634db6384bf34', hi: 'f2e8c361b21549d28695baba7cf51500', fr: 'a18a3d576686447186abdb61df582a3e' },
  history: { en: 'c3958f083c2d407982263c77cfa831e3', hi: '589d8fcedda349df98ea66ad15416d6b', fr: 'b6efa2e7896645c28589046c576ddb2e' },
  friend: { en: '1b1286fcf2f44d8ba1405e0b71abca22', hi: '94fc4065e6e04b9baf1aea2107e91d66', fr: 'f28ebc67cf424f9ab4f2c478f6f256c4' },
};

const emphasiseNumbers = (text) => text.replace(/(\d[\d,.\s]*\d|\d)/g, '[emphasis] $1');

/** S2 bracket cues per style. Fish documents them for English and French but not Hindi, so Hindi is spoken untagged. */
function performance({ hello, line, lang, persona }) {
  if (lang === 'hi') return `${hello} ${line}`;
  if (persona === 'story') return `[delighted] ${hello} [break] [soft tone] ${line}`;
  if (persona === 'history') return `[calm] ${hello} [break] [confident] ${emphasiseNumbers(line)}`;
  return `[excited] ${hello} [break] [relaxed] ${line}`;
}

const cache = new Map();

export async function synthesize({ text }, env) {
  const entry = typeof text === 'string' && LINES.get(text);
  if (!entry) return { status: 400, error: 'Only the guide preview lines can be spoken.' };
  if (!env.FISH_API_KEY) return { status: 503, error: 'FISH_API_KEY is not set on the server.' };
  const { persona, lang } = entry;
  const voice = env[`FISH_VOICE_${persona.toUpperCase()}_${lang.toUpperCase()}`] || env[`FISH_VOICE_${persona.toUpperCase()}`] || VOICES[persona][lang];
  const spoken = performance(entry);
  const id = `${voice}|${spoken}`;
  if (cache.has(id)) return { status: 200, audio: cache.get(id) };

  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.FISH_API_KEY}`,
      'Content-Type': 'application/json',
      model: env.FISH_MODEL || 's2.1-pro-free',
    },
    body: JSON.stringify({ text: spoken, reference_id: voice, format: 'mp3' }),
  });
  if (!res.ok) return { status: 502, error: `Fish Audio returned ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const audio = Buffer.from(await res.arrayBuffer());
  if (cache.size > 300) cache.clear();
  cache.set(id, audio);
  return { status: 200, audio };
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 20000) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

/** A Node (req, res) handler: Vite's dev and preview servers use it, and so can a serverless function. */
export function fishHandler(env) {
  return async (req, res) => {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    let result;
    try {
      result = await synthesize(await readJson(req), env);
    } catch (error) {
      result = { status: 400, error: error.message };
    }
    res.statusCode = result.status;
    if (result.audio) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(result.audio);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: result.error }));
    }
  };
}
