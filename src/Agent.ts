import { v4 as uuidv4 } from 'uuid';
import { Observation } from './Observation.js';
import { Observer } from './Observer.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { Tool } from './Tool.js';
import { InputMessage, OutputMessage, Response } from './types.js';
import {
  isValidJson,
  selectAllText,
  selectLastText,
  selectToolUseBlock,
} from './utils.js';
export class Agent {
  private readonly provider: BaseProvider;
  private readonly tools: Tool[];
  private readonly maxTurns: number;
  private readonly system: string | undefined;
  private readonly observer: Observer;
  constructor(options: {
    system?: string;
    provider: BaseProvider;
    tools?: Tool[];
    maxTurns?: number;
    langfuse?: {
      publicKey: string;
      secretKey: string;
    };
  }) {
    this.provider = options.provider;
    this.system = options.system;
    this.tools = options.tools ?? [];
    this.maxTurns = options.maxTurns ?? 5;
    this.observer = Observer.createFromOptions({
      langfuse: options.langfuse,
    });
  }

  async getResponse(options: {
    messages: InputMessage[];
    model: string;
    userId?: string;
    sessionId?: string;
    jsonSchema?: unknown;
  }): Promise<Response> {
    const { messages, userId, sessionId, jsonSchema } = options;
    const outputMessages: OutputMessage[] = [];
    let turns = 0;
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
      In your final message, you must return a JSON object that matches the following schema:

      ${JSON.stringify(jsonSchema, null, 2)}`;
    }
    while (turns < this.maxTurns) {
      turns++;
      const allMessages = messages.concat(
        outputMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
      const newMessage = await this.getMessage({
        system: systemMessage,
        model: options.model,
        messages: allMessages,
        observation: trace,
      });
      outputMessages.push(newMessage);
      const toolUseBlock = selectToolUseBlock(newMessage.content);
      if (!toolUseBlock) break;
      const tool = this.findToolByName(toolUseBlock.name);
      if (!tool)
        throw new Error(`Tool with name ${toolUseBlock.name} not found.`);
      const toolResponseContent = await tool.call(toolUseBlock.input, {
        id: uuidv4(),
        messages,
        observation: trace,
      });
      outputMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: toolResponseContent,
          },
        ],
      });
    }
    trace.end({
      output: {
        messages: outputMessages,
      },
    });
    if (jsonSchema) {
      const lastText = selectLastText({ messages: outputMessages });
      const isValid = isValidJson({
        content: lastText,
        jsonSchema,
      });
      if (!isValid) {
        throw new Error('Invalid JSON');
      }
      return {
        type: 'response',
        output: outputMessages,
        output_text: lastText,
      };
    }
    return {
      type: 'response',
      output: outputMessages,
      output_text: selectAllText({ messages: outputMessages }),
    };
  }

  async getMessage(args: {
    system?: string;
    messages: InputMessage[];
    model: string;
    observation: Observation;
  }): Promise<OutputMessage> {
    const message = await this.provider.fetchMessage({
      model: args.model,
      system: args.system,
      messages: args.messages,
      observation: args.observation,
      tools: this.tools,
    });
    return message;
  }

  findToolByName(name: string): Tool {
    const tool = this.tools.find((tool) => tool.name === name);
    if (!tool) throw new Error(`Tool with name ${name} not found.`);
    return tool;
  }
}
