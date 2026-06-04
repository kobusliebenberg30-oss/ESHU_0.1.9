import type { Readable } from 'node:stream';

/**
 * StorageDriver: pluggable blob backend.
 * Keys are content-addressed (sha256) by callers; drivers must NOT mutate keys.
 */
export interface StorageDriver {
  put(key: string, data: Buffer | Readable, contentType: string): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
