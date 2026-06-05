import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { StorageDriver } from './driver.js';

export class SupabaseStorageDriver implements StorageDriver {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(url: string, serviceRoleKey: string, bucket: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    this.bucket = bucket;
  }

  private files() {
    return this.client.storage.from(this.bucket);
  }

  async put(key: string, data: Buffer | Readable, contentType: string): Promise<void> {
    const body = Buffer.isBuffer(data) ? data : await this.toBuffer(data);
    const { error } = await this.files().upload(key, body, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) throw error;
  }

  async get(key: string): Promise<Readable> {
    const { data, error } = await this.files().download(key);
    if (error) throw error;
    return Readable.fromWeb(data.stream() as unknown as WebReadableStream<Uint8Array>);
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.files().remove([key]);
    if (error) throw error;
  }

  async exists(key: string): Promise<boolean> {
    const { error } = await this.files().download(key);
    return !error;
  }

  private async toBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
