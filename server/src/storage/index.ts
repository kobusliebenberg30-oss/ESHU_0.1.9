import { env } from '../env.js';
import type { StorageDriver } from './driver.js';
import { LocalStorageDriver } from './local.js';
import { SupabaseStorageDriver } from './supabase.js';

let instance: StorageDriver | null = null;

export const storage = (): StorageDriver => {
  if (instance) return instance;
  switch (env.STORAGE_DRIVER) {
    case 'local':
      instance = new LocalStorageDriver(env.STORAGE_LOCAL_DIR);
      return instance;
    case 's3':
      throw new Error('S3 driver not implemented yet');
    case 'supabase':
      instance = new SupabaseStorageDriver(
        env.SUPABASE_URL!,
        env.SUPABASE_SERVICE_ROLE_KEY!,
        env.STORAGE_SUPABASE_BUCKET,
      );
      return instance;
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${String(env.STORAGE_DRIVER)}`);
  }
};

export type { StorageDriver };
