import { AzureClientOptions, AzureOpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources.js';
import { LocalCache } from '../LocalCache.js';
import {
  ContentBlock,
  FetchMessageOptions,
  InputMessage,
  OutputMessage,
} from '../types.js';
import { BaseProvider } from './BaseProvider.js';

export class AzureOpenAIProvider extends BaseProvider {
  private readonly azureOpenAI: AzureOpenAI;
  constructor(options: {
    cache?: LocalCache;
    clientOptions: AzureClientOptions;
  }) {
    super({
      cache: options.cache,
    });
    this.azureOpenAI = new AzureOpenAI(options.clientOptions);
  }
  async fetchRawMessage(options: FetchMessageOptions): Promise<OutputMessage> {
    function constructMessage(
      message: InputMessage,
    ): ChatCompletionMessageParam {
      if (typeof message.content === 'string') {
        return {
          role: message.role,
          content: message.content,
        };
      }
      if (message.content.some((c) => c.type === 'tool_use')) {
        return {
          role: 'assistant',
          tool_calls: message.content
            .filter((c) => c.type === 'tool_use')
            .map((c) => {
              return {
                type: 'function',
                id: c.id,
                function: {
                  name: c.name,
                  arguments: String(c.input),
                },
              };
            }),
        };
      }
      if (message.content.some((c) => c.type === 'tool_result')) {
        const toolResult = message.content.find(
          (c) => c.type === 'tool_result',
        );
        if (!toolResult) {
          throw new Error('Tool result not found');
        }
        return {
          role: 'tool',
          tool_call_id: toolResult.tool_use_id,
          content: toolResult.content,
        };
      }
      return {
        role: message.role,
        content: message.content
          .map((c) => {
            switch (c.type) {
              case 'text':
                return {
                  type: 'text',
                  text: c.text,
                };
              default:
                throw new Error(`Error handling content type: ${c.type}`);
            }
          })
          .join(''),
      };
    }
    const messages = options.messages.map(constructMessage);
    const response = await this.azureOpenAI.chat.completions.create({
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      tools: options.tools?.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.getInputJsonSchema(),
        },
      })),
    });
    const contentBlocks: ContentBlock[] = [];
    if (typeof response.choices[0].message.content === 'string') {
      contentBlocks.push({
        type: 'text',
        text: response.choices[0].message.content,
      });
    }
    if (response.choices[0].message.tool_calls) {
      for (const toolCall of response.choices[0].message.tool_calls) {
        contentBlocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
      }
    }
    return {
      role: 'assistant',
      type: 'message',
      content: contentBlocks,
      tokens_used: response.usage?.total_tokens || 0,
    };
  }
}
