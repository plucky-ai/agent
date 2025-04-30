import { LocalCache } from '../LocalCache.js';
import { Observation } from '../Observation.js';
import { Tool } from '../Tool.js';
import { InputMessage, OutputMessage } from '../types.js';

export class BaseProvider {
  public readonly cache: LocalCache | null;
  constructor(options: { cache?: LocalCache }) {
    this.cache = options.cache ?? null;
  }

  async fetchMessage(_options: {
    model: string;
    system?: string;
    messages: InputMessage[];
    tools?: Tool[];
    observation: Observation;
    name?: string;
  }): Promise<OutputMessage> {
    throw new Error('Not implemented');
  }
}
