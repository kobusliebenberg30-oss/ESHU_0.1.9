/**
 * Database invariants run at server boot.
 *
 * The goal is to catch state desynchronization between the Prisma schema and
 * the live database BEFORE serving traffic. We deliberately keep this
 * lightweight (a single Prisma query) so the startup cost is negligible.
 *
 * Failure modes:
 *   - Production: any failure aborts startup (process.exit(1)).
 *   - Development: failures log a loud warning but allow boot so the
 *     developer can hot-edit fixes without restarting their tools.
 */
import { prisma } from './client.js';
import { logger } from '../lib/logger.js';
import { env } from '../env.js';

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export const assertDatabaseInvariants = async (): Promise<void> => {
  const isProd = env.NODE_ENV === 'production';
  // In a long-running process, a fatal DB invariant failure should abort start.
  // In a serverless function (Vercel), process.exit(1) kills the lambda before
  // it can respond; individual requests will surface a 503 via the error handler
  // instead. Detect serverless by the absence of a persistent process manager.
  const isServerless = !!process.env.VERCEL;
  const fail = (reason: string, extra?: Record<string, unknown>) => {
    if (isProd && !isServerless) {
      logger.fatal({ reason, ...extra }, 'database invariant failed — refusing to start');
      process.exit(1);
    } else {
      logger.warn({ reason, ...extra }, 'database invariant warning (continuing)');
    }
  };

  // 1. Connectivity.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    fail('cannot connect to database', { err: (err as Error).message });
    return;
  }

  // 2. Migration table presence + no rolled-back migrations.
  //    We avoid `prisma migrate status` here because it's a CLI tool; the
  //    `_prisma_migrations` table is part of the contract and safe to query.
  try {
    const rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `;
    if (rows.length === 0) {
      fail('no migrations have been applied to this database', {});
      return;
    }
    const pending = rows.filter((r) => r.finished_at === null && r.rolled_back_at === null);
    const rolledBack = rows.filter((r) => r.rolled_back_at !== null);
    if (pending.length > 0) {
      fail('pending migrations detected', {
        pending: pending.map((r) => r.migration_name),
      });
      return;
    }
    if (rolledBack.length > 0) {
      fail('rolled-back migrations detected; database is in an inconsistent state', {
        rolledBack: rolledBack.map((r) => r.migration_name),
      });
      return;
    }
    logger.info(
      { migrations: rows.length, latest: rows[rows.length - 1]?.migration_name },
      'database invariants ok',
    );
  } catch (err) {
    fail('failed to inspect _prisma_migrations table', { err: (err as Error).message });
  }
};
