import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type {
  MessageCreateParams,
  MessageParam,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import { LocalCache } from '../LocalCache.js';
import { FetchRawMessageOptions, OutputMessage } from '../types.js';
import { useCacheIfPresent } from '../utils.js';
import { BaseProvider } from './BaseProvider.js';

export class AWSAnthropicProvider extends BaseProvider {
  private readonly anthropic: AnthropicBedrock;
  constructor(options: {
    awsAccessKey: string;
    awsSecretKey: string;
    awsRegion: string;
    cache?: LocalCache;
  }) {
    super({
      cache: options.cache,
    });
    this.anthropic = new AnthropicBedrock({
      awsAccessKey: options.awsAccessKey,
      awsSecretKey: options.awsSecretKey,
      awsRegion: options.awsRegion,
    });
  }
  async fetchMessage(options: FetchRawMessageOptions): Promise<OutputMessage> {
    const { messages, system, model } = options;
    const args: MessageCreateParams = {
      system,
      model,
      messages: messages as unknown as MessageParam[],
      max_tokens: 1000,
      tools: options.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.getInputJsonSchema() as Tool.InputSchema,
      })),
    };
    const generation = options.observation.generation({
      inputs: args,
    });
    const getAnthropicMessage = useCacheIfPresent<
      (args: MessageCreateParams) => Promise<OutputMessage>
    >(this.anthropic.messages.create.bind(this.anthropic.messages), this.cache);
    const response = await getAnthropicMessage(args);
    generation.end({
      output: response,
    });
    return {
      type: 'message',
      role: 'assistant',
      content: response.content,
    };
  }
}
