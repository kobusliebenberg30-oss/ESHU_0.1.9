import type { Express } from 'express';
import { buildApp } from './app.js';
import { assertDatabaseInvariants } from './db/invariants.js';

let ready: Promise<Express> | null = null;

/**
 * Build the Express app once and verify database invariants.
 * Shared by the long-running Node process and Vercel serverless.
 */
export const createApp = (): Promise<Express> => {
  if (!ready) {
    ready = (async () => {
      const app = buildApp();
      if (process.env.VERCEL) {
        // Serverless cold start: the invariant check is two sequential DB
        // round-trips, and here it only ever *warns* (process.exit would kill
        // the lambda mid-response, so it's disabled in serverless anyway).
        // Blocking the first request on it just adds cold-start latency that
        // the user pays on their first sign-in pull. Run it in the background
        // instead — it still logs drift, it just doesn't gate traffic.
        void assertDatabaseInvariants().catch(() => {});
      } else {
        // Long-running process (local / self-host): keep it as a pre-flight
        // gate so a bad deploy is caught before serving any traffic.
        await assertDatabaseInvariants();
      }
      return app;
    })();
  }
  return ready;
};
