import { v4 as uuidv4 } from 'uuid';
import { Observation } from './Observation.js';
import { Observer } from './Observer.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { Tool } from './Tool.js';
import {
  ContentBlock,
  InputMessage,
  OutputMessage,
  Response,
  ToolUseBlock,
} from './types.js';
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
  }): Promise<Response> {
    const { messages, userId, sessionId } = options;
    const outputMessages: OutputMessage[] = [];
    let turns = 0;
    const trace = this.observer.trace({
      input: {
        messages,
      },
      userId,
      sessionId,
    });
    while (turns < this.maxTurns) {
      turns++;
      const allMessages = messages.concat(
        outputMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
      const newMessage = await this.getMessage({
        system: this.system,
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
    // FIXME: Should break out prior block so trace is always ended
    trace.end({
      output: {
        messages: outputMessages,
      },
    });
    return {
      messages: outputMessages,
      stop_reason: 'max_turns',
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

function selectToolUseBlock(
  content: string | ContentBlock[],
): ToolUseBlock | null {
  if (typeof content === 'string') {
    return null;
  }
  return content.find((block) => block.type === 'tool_use');
}
