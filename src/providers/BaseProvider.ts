import { LocalCache } from '../LocalCache.js';
import { FetchRawMessageOptions, OutputMessage } from '../types.js';

export class BaseProvider {
  public readonly cache: LocalCache | null;
  constructor(options: { cache?: LocalCache }) {
    this.cache = options.cache ?? null;
  }

  async fetchMessage(_options: FetchRawMessageOptions): Promise<OutputMessage> {
    throw new Error('Not implemented');
  }
}
