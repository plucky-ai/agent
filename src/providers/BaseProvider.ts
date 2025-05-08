import { LocalCache } from '../LocalCache.js';
import { FetchRawMessageOptions, OutputMessage } from '../types.js';

export class BaseProvider {
  public readonly cache: LocalCache | null;
  private readonly version: string;

  constructor(options: { cache?: LocalCache; version?: string }) {
    this.cache = options.cache ?? null;
    this.version = options.version ?? '0'; // Invalidates caching for fetchRawMessage
  }

  async fetchMessage(options: FetchRawMessageOptions): Promise<OutputMessage> {
    const { system, model, messages, tools, name, maxTokens } = options;
    const cacheKey = {
      version: this.version,
      system,
      model,
      messages,
      tools: tools?.map((tool) => tool.toCacheKey()),
      name,
      maxTokens,
    };
    const generation = options.observation.generation({
      input: options.messages,
      model: options.model,
      modelParameters: {
        maxTokens: options.maxTokens,
      },
      name: options.name,
    });

    if (this.cache) {
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        generation.end({
          output: cachedResult,
        });
        return cachedResult as OutputMessage;
      }
    }

    const response = await this.fetchRawMessage(options);
    generation.end({
      output: response,
    });
    if (this.cache) {
      await this.cache.set(cacheKey, response);
    }
    return response;
  }
  async fetchRawMessage(
    _options: FetchRawMessageOptions,
  ): Promise<OutputMessage> {
    throw new Error('Not implemented');
  }
}
