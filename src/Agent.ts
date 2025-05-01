import { v4 as uuidv4 } from 'uuid';
import { Observation } from './Observation.js';
import { Observer } from './Observer.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { Tool } from './Tool.js';
import {
  InputMessage,
  OutputMessage,
  Response,
  ToolUseBlock,
} from './types.js';
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
      In your final message, you must return only a JSON object that matches the below schema with no other commentary.

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
      const toolMessage = await this.runTool({
        toolUseBlock,
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
      return this.getValidatedJsonResponse({
        messages: messages.concat(outputMessages),
        jsonSchema,
        model: options.model,
        observation: trace,
      });
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
  async runTool(options: {
    toolUseBlock: ToolUseBlock;
    messages: InputMessage[];
    observation: Observation;
  }): Promise<OutputMessage> {
    const { toolUseBlock, messages, observation } = options;
    const tool = this.findToolByName(toolUseBlock.name);
    if (!tool)
      throw new Error(`Tool with name ${toolUseBlock.name} not found.`);
    const toolResponseContent = await tool.call(toolUseBlock.input, {
      id: uuidv4(),
      messages,
      observation,
    });
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: toolResponseContent,
        },
      ],
    };
  }
  async getValidatedJsonResponse(
    options: {
      jsonSchema: unknown;
      messages: OutputMessage[];
      model: string;
      observation: Observation;
    },
    attempts = 0,
  ): Promise<Response> {
    attempts++;
    const { jsonSchema, messages, model, observation } = options;
    const lastText = selectLastText({ messages });
    const { isValid, errors } = isValidJson(lastText, jsonSchema);
    if (!isValid) {
      if (attempts > 1) {
        throw new Error(`Invalid JSON: ${lastText.slice(0, 100)}`);
      }
      const secondAttempt = await this.provider.fetchMessage({
        messages: messages.concat([
          {
            role: 'user',
            content: `The previous JSON response was invalid and returned the below errors. Please return a valid JSON object that matches the below schema.

            ${JSON.stringify(jsonSchema, null, 2)}

            Errors: ${errors}`,
          },
        ]),
        model,
        observation,
      });
      return this.getValidatedJsonResponse(
        {
          messages: [...messages, secondAttempt],
          jsonSchema,
          model,
          observation,
        },
        attempts,
      );
    }
    return {
      type: 'response',
      output: messages,
      output_text: lastText,
    };
  }
}
