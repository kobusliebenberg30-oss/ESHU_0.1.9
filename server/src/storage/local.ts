import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StorageDriver } from './driver.js';

export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private path(key: string): string {
    // Shard by first 2 chars to avoid huge directories
    const shard = key.slice(0, 2);
    return join(this.root, shard, key);
  }

  async put(key: string, data: Buffer | Readable, _contentType: string): Promise<void> {
    const filePath = this.path(key);
    await mkdir(dirname(filePath), { recursive: true });
    const source = Buffer.isBuffer(data) ? Readable.from(data) : data;
    await pipeline(source, createWriteStream(filePath));
  }

  async get(key: string): Promise<Readable> {
    return createReadStream(this.path(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
}
