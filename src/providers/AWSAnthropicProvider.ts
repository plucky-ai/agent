import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type {
  MessageCreateParams,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import { LocalCache } from '../LocalCache.js';
import { FetchRawMessageOptions, OutputMessage } from '../types.js';
import { useCacheIfPresent } from '../utils.js';
import { BaseProvider } from './BaseProvider.js';
import { Anthropic } from '@anthropic-ai/sdk/index.js';

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
    const { messages, system, model, maxTokens } = options;
    const args: MessageCreateParams = {
      system,
      model,
      messages: messages as MessageCreateParams['messages'],
      max_tokens: maxTokens,
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
      (args: MessageCreateParams) => Promise<Anthropic.Messages.Message>
    >(this.anthropic.messages.create.bind(this.anthropic.messages), this.cache);
    const response = await getAnthropicMessage(args);
    generation.end({
      output: response,
    });
    return {
      type: 'message',
      role: 'assistant',
      content:
        typeof response.content === 'string'
          ? response.content
          : (response.content.filter((block) =>
              ['text', 'tool_use'].includes(block.type),
            ) as (
              | Anthropic.Messages.TextBlock
              | Anthropic.Messages.ToolUseBlock
            )[]),
      tokens_used: response.usage.output_tokens,
    };
  }
}
