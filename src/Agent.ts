import { v4 as uuidv4 } from 'uuid';
import { Observation } from './Observation.js';
import { Observer } from './Observer.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { Tool } from './Tool.js';
import {
  InputMessage,
  OutputMessage,
  Response,
  ToolUseContentBlock,
} from './types.js';
import {
  isValidJson,
  selectAllText,
  selectLastText,
  selectToolUseBlock,
} from './utils.js';
export class Agent {
  private readonly tools: Tool[];
  private readonly system: string | undefined;
  private readonly observer: Observer;
  constructor(options: {
    system?: string;
    tools?: Tool[];
    langfuse?: {
      publicKey: string;
      secretKey: string;
    };
  }) {
    this.system = options.system;
    this.tools = options.tools ?? [];
    this.observer = Observer.createFromOptions({
      langfuse: options.langfuse,
    });
  }

  async getResponse(options: {
    messages: InputMessage[];
    provider: BaseProvider;
    model: string;
    userId?: string;
    sessionId?: string;
    jsonSchema?: unknown;
    maxTokens?: number;
    maxTurns?: number;
  }): Promise<Response> {
    const { messages, userId, sessionId, jsonSchema, provider, model } =
      options;
    const outputMessages: OutputMessage[] = [];
    const maxTokens = options.maxTokens ?? 10000;
    const maxTurns = options.maxTurns ?? 5;
    let turns = 0;
    let tokens = 0;
    const trace = this.observer.trace({
      input: {
        messages,
        jsonSchema,
      },
      userId,
      sessionId,
    });
    let systemMessage = this.system;
    if (jsonSchema) {
      systemMessage += `
      In your final message, you must return only a JSON object that matches the below schema with no other commentary.

      ${JSON.stringify(jsonSchema, null, 2)}`;
    }

    while (turns < maxTurns && maxTokens - tokens > 0) {
      turns++;
      const allMessages = messages.concat(
        outputMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
      const newMessage = await provider.fetchMessage({
        system:
          systemMessage +
          getBudgetMessage({
            maxTokens,
            maxTurns,
            tokens,
            turns,
          }),
        model,
        messages: allMessages,
        observation: trace,
        maxTokens: maxTokens - tokens,
        tools: this.tools,
      });
      tokens += newMessage.tokens_used;
      outputMessages.push(newMessage);
      const toolUseContentBlock = selectToolUseBlock(newMessage.content);
      if (!toolUseContentBlock) break;
      const toolMessage = await this.runTool({
        toolUseContentBlock,
        messages: allMessages,
        observation: trace,
      });
      outputMessages.push(toolMessage);
    }
    trace.end({
      output: {
        messages: outputMessages,
      },
    });
    if (jsonSchema) {
      const jsonResponse = await this.getValidatedJsonResponse({
        messages: messages.concat(
          outputMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ),
        jsonSchema,
        model,
        observation: trace,
        provider,
        maxTokens: maxTokens - tokens,
      });
      outputMessages.push(...jsonResponse.output);
    }
    return {
      type: 'response',
      output: outputMessages,
      output_text: selectAllText({ messages: outputMessages }),
      tokens_used: tokens,
    };
  }

  findToolByName(name: string): Tool {
    const tool = this.tools.find((tool) => tool.name === name);
    if (!tool) throw new Error(`Tool with name ${name} not found.`);
    return tool;
  }
  async runTool(options: {
    toolUseContentBlock: ToolUseContentBlock;
    messages: InputMessage[];
    observation: Observation;
  }): Promise<OutputMessage> {
    const { toolUseContentBlock, messages, observation } = options;
    const tool = this.findToolByName(toolUseContentBlock.name);
    if (!tool)
      throw new Error(`Tool with name ${toolUseContentBlock.name} not found.`);
    const toolResponseContent = await tool.call(toolUseContentBlock.input, {
      id: uuidv4(),
      messages,
      observation,
    });
    return {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseContentBlock.id,
          content: toolResponseContent,
        },
      ],
      tokens_used: 0,
    };
  }
  async getValidatedJsonResponse(
    options: {
      jsonSchema: unknown;
      messages: InputMessage[];
      model: string;
      observation: Observation;
      provider: BaseProvider;
      maxTokens: number;
      tokens?: number;
    },
    attempts = 0,
  ): Promise<Response> {
    attempts++;
    const { jsonSchema, messages, model, observation, provider, maxTokens } =
      options;
    let tokens = options.tokens ?? 0;
    const outputMessages: OutputMessage[] = [];

    const lastText = selectLastText({ messages });
    const { isValid, errors } = await isValidJson(lastText, jsonSchema);
    if (!isValid) {
      if (attempts > 1) {
        throw new Error(`Invalid JSON: ${lastText.slice(0, 100)}`);
      }
      const message = await provider.fetchMessage({
        messages: messages.concat([
          {
            role: 'user',
            content: `The previous JSON response was invalid and returned the below errors. Please return a valid JSON object that matches the below schema.

            ${JSON.stringify(jsonSchema, null, 2)}

            Errors: ${errors}`,
          },
        ]),
        model,
        maxTokens: maxTokens - tokens,
        observation,
        name: 'structure_json',
      });
      tokens += message.tokens_used;
      outputMessages.push(message);
      messages.push({
        role: 'assistant',
        content: message.content,
      });
      return this.getValidatedJsonResponse(
        {
          messages: [...messages, message],
          jsonSchema,
          model,
          observation,
          provider,
          maxTokens: options.maxTokens,
          tokens,
        },
        attempts,
      );
    }
    return {
      type: 'response',
      output: outputMessages,
      output_text: lastText,
      tokens_used: tokens,
    };
  }
}

function getBudgetMessage(options: {
  maxTokens: number;
  maxTurns: number;
  tokens: number;
  turns: number;
}): string {
  const { maxTokens, maxTurns, tokens, turns } = options;
  return `You have used ${tokens} tokens and ${turns} turns to provide a response. You have ${maxTokens - tokens} tokens and ${maxTurns - turns} turns remaining.`;
}
