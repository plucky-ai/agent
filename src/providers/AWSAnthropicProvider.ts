import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { Anthropic } from '@anthropic-ai/sdk/index.js';
import type {
  MessageCreateParams,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import { LocalCache } from '../LocalCache.js';
import { FetchRawMessageOptions, OutputMessage } from '../types.js';
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
    const response = await this.fetchRawMessage(args);
    console.log('response', JSON.stringify(response, null, 2));
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
      tokens_used: response.usage.output_tokens + response.usage.input_tokens,
    };
  }
  async fetchRawMessage(
    args: MessageCreateParams,
  ): Promise<Anthropic.Messages.Message> {
    if (this.cache) {
      const cachedResult = await this.cache.get(args);
      if (cachedResult) return cachedResult as Anthropic.Messages.Message;
    }
    const response = await this.anthropic.messages.create(args);
    if (this.cache) {
      await this.cache.set(args, response);
    }
    return response;
  }
}
