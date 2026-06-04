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
      await assertDatabaseInvariants();
      return buildApp();
    })();
  }
  return ready;
};
