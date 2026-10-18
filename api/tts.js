import { fishHandler } from '../server/fish-tts.js';

/** Serverless entry point (Vercel-style), for hosting the site with the guide voice in production. */
export default fishHandler(process.env);
