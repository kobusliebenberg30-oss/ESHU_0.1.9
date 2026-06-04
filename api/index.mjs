import { createApp } from '../server/dist/bootstrap.js';

const appPromise = createApp();

/** Vercel Node serverless entry — Express handles req/res directly. */
export default async function handler(req, res) {
  const app = await appPromise;
  return app(req, res);
}
// rebuild marker 2026-05-27T01:24:15.5427818+02:00
