import fs from 'fs/promises';
import path from 'path';
import { getOrderedHash } from './utils.js';
export class LocalCache {
  fileConfirmedExists: boolean;
  constructor(public readonly path: string) {
    this.fileConfirmedExists = false;
  }
  async confirmFileExists(): Promise<void> {
    if (!this.fileConfirmedExists) {
      const dirpath = path.dirname(this.path);

      try {
        await fs.access(dirpath);
      } catch (e) {
        if (e instanceof Error && e.message.includes('ENOENT')) {
          await fs.mkdir(dirpath, { recursive: true });
        } else {
          throw e;
        }
      } finally {
        this.fileConfirmedExists = false;
      }

      try {
        await fs.access(this.path);
      } catch (e) {
        if (e instanceof Error && e.message.includes('ENOENT')) {
          await fs.writeFile(this.path, '{}');
        } else {
          throw e;
        }
      }
    }
  }
  async get(args: unknown): Promise<unknown> {
    if (typeof args === 'string') {
      return this.getByKey(args);
    }
    return this.getByKey(getOrderedHash(args));
  }
  async set(args: unknown, value: unknown): Promise<void> {
    if (typeof args === 'string') {
      await this.setByKey(args, value);
    } else {
      await this.setByKey(getOrderedHash(args), value);
    }
  }
  async getByKey(key: string): Promise<unknown> {
    const data = await this.getCacheData();
    return data[key] ?? null;
  }
  async setByKey(key: string, value: unknown): Promise<void> {
    const data = await this.getCacheData();
    data[key] = value ?? null;
    await fs.writeFile(this.path, stringify(data));
  }
  async getCacheData(): Promise<Record<string, unknown>> {
    await this.confirmFileExists();
    const data = await fs.readFile(this.path, 'utf8');
    return JSON.parse(data);
  }
}

function stringify(data: string | Record<string, unknown>): string {
  if (typeof data === 'string') {
    return data;
  }
  return JSON.stringify(data, null, 2);
}
