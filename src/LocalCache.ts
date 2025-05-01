import fs from 'fs/promises';
import path from 'path';
import { getOrderedHash } from './utils.js';
export class LocalCache {
  readPath: string;
  writePath: string;
  filesChecked: boolean;
  constructor(options: {
    path?: string;
    readPath?: string;
    writePath?: string;
  }) {
    const { path, readPath, writePath } = options;
    if (!path && !readPath && !writePath) {
      throw new Error('Path or readPath and writePath must be provided.');
    }
    if (path && (readPath || writePath)) {
      throw new Error(
        'Path and readPath or writePath cannot both be provided.',
      );
    }
    this.readPath = readPath ?? path;
    this.writePath = writePath ?? path;
    this.filesChecked = false;
  }
  async confirmFilesExist(): Promise<void> {
    if (!this.filesChecked) {
      await confirmCacheFileExists(this.readPath);
      await confirmCacheFileExists(this.writePath);
      this.filesChecked = true;
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
    await fs.writeFile(this.writePath, stringify(data));
  }
  async getCacheData(): Promise<Record<string, unknown>> {
    await this.confirmFilesExist();
    const data = await fs.readFile(this.readPath, 'utf8');
    return JSON.parse(data);
  }
}

function stringify(data: string | Record<string, unknown>): string {
  if (typeof data === 'string') {
    return data;
  }
  return JSON.stringify(data, null, 2);
}

async function confirmCacheFileExists(filepath: string): Promise<void> {
  const dirpath = path.dirname(filepath);

  try {
    await fs.access(dirpath);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ENOENT')) {
      await fs.mkdir(dirpath, { recursive: true });
    } else {
      throw e;
    }
  }

  try {
    await fs.access(filepath);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ENOENT')) {
      await fs.writeFile(filepath, '{}');
    } else {
      throw e;
    }
  }
}
