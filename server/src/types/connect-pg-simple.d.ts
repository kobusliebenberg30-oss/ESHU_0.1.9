// Minimal ambient typing for `connect-pg-simple` v10.
// Upstream ships JS only and `@types/connect-pg-simple` lags behind, so
// we declare just the surface we use: a factory that takes an
// `express-session` instance and returns a Store constructor.

declare module 'connect-pg-simple' {
  import type session from 'express-session';

  interface PgStoreOptions {
    /** Postgres connection string (preferred). */
    conString?: string;
    /** Pre-configured `pg.Pool` (alternative to `conString`). */
    pool?: unknown;
    /** Custom `pg` module (rarely needed). */
    pgPromise?: unknown;
    /** Session table name (default: `session`). */
    tableName?: string;
    /** Schema-qualified table name. */
    schemaName?: string;
    /** Auto-create the session table on first use. */
    createTableIfMissing?: boolean;
    /** Session TTL in seconds (overrides cookie maxAge). */
    ttl?: number;
    /** Disable internal pruning interval. */
    disableTouch?: boolean;
    /** Pruning cadence in seconds (default: 15 * 60). */
    pruneSessionInterval?: number | false;
    /** Custom error handler. */
    errorLog?: (...args: unknown[]) => void;
  }

  type SessionFactory = typeof session;

  function connectPgSimple(
    sess: SessionFactory,
  ): new (options?: PgStoreOptions) => session.Store;

  export = connectPgSimple;
}
