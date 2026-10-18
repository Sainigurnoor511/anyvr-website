import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const PLACES = new Set(['', 'taj', 'eiffel', 'valloire', 'giza']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map();
let queue = Promise.resolve();

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

async function saveToFile(file, entry) {
  let list = [];
  try { list = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (list.some((item) => item.email === entry.email)) return 'already';
  list.push(entry);
  await mkdir(dirname(file), { recursive: true });
  // write then rename, so a crash mid-write never leaves a half-written list
  await writeFile(`${file}.tmp`, JSON.stringify(list, null, 2));
  await rename(`${file}.tmp`, file);
  return 'joined';
}

async function sendToWebhook(url, entry) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
  if (!res.ok) throw new Error(`webhook returned ${res.status}`);
  return 'joined';
}

export async function join(body, env, ip = '') {
  if (body.website) return { status: 200, result: 'joined' };
  const email = String(body.email || '').trim().toLowerCase();
  const place = String(body.place || '');
  if (!email || email.length > 254 || !EMAIL.test(email)) return { status: 400, error: 'Enter a valid email address.' };
  if (!PLACES.has(place)) return { status: 400, error: 'Pick one of the listed places, or none.' };
  if (limited(ip)) return { status: 429, error: 'Too many tries. Please wait a few minutes.' };
  const entry = { email, place, at: new Date().toISOString() };
  // one write at a time, so two sign-ups never overwrite each other
  const task = queue.then(() => (env.WAITLIST_WEBHOOK_URL
    ? sendToWebhook(env.WAITLIST_WEBHOOK_URL, entry)
    : saveToFile(resolve(env.WAITLIST_FILE || 'data/waitlist.json'), entry)));
  queue = task.catch(() => {});
  return { status: 200, result: await task };
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((ok, fail) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 4000) fail(new Error('too large')); });
    req.on('end', () => { try { ok(JSON.parse(raw || '{}')); } catch (error) { fail(error); } });
    req.on('error', fail);
  });
}

/** A Node (req, res) handler for the Vite dev/preview servers or a serverless function. */
export function waitlistHandler(env) {
  return async (req, res) => {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    let out, body;
    try {
      body = await readJson(req);
    } catch {
      body = null;
    }
    try {
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
      out = body && typeof body === 'object' ? await join(body, env, ip) : { status: 400, error: 'Enter a valid email address.' };
    } catch (error) {
      console.error('waitlist:', error.message);
      out = { status: 500, error: 'Something went wrong on our side. Please try again.' };
    }
    res.statusCode = out.status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(out.error ? { error: out.error } : { result: out.result }));
  };
}
