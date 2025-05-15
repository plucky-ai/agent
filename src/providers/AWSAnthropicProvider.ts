import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
import type {
  MessageCreateParams,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import { LocalCache } from '../LocalCache.js';
import { FetchMessageOptions, OutputMessage } from '../types.js';
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

  async fetchRawMessage(options: FetchMessageOptions): Promise<OutputMessage> {
    const args: MessageCreateParams = {
      system: options.system,
      model: options.model,
      messages: options.messages as MessageCreateParams['messages'],
      max_tokens: Math.min(options.maxTokens, 8000),
      tools: options.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.getInputJsonSchema() as Tool.InputSchema,
      })),
    };

    const response = await this.anthropic.messages.create(args);

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
}
