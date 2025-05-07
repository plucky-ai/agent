import { v4 as uuidv4 } from 'uuid';
import { JsonValidator } from './JsonValidator.js';
import { Observation } from './Observation.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { Tool } from './Tool.js';
import {
  InputMessage,
  OutputMessage,
  Response,
  ToolResultContentBlock,
  ToolUseContentBlock,
} from './types.js';
import { selectAllText, selectLastText, selectToolUseBlocks } from './utils.js';
export class Agent {
  private readonly tools: Tool[];
  private readonly instructions: string | undefined;
  constructor(options: { instructions?: string; tools?: Tool[] }) {
    this.instructions = options.instructions;
    this.tools = options.tools ?? [];
  }

  async getResponse(options: {
    observation?: Observation;
    messages: InputMessage[];
    provider: BaseProvider;
    model: string;
    jsonSchema?: unknown;
    maxTokens: number;
    maxTurns?: number;
  }): Promise<Response> {
    const { messages, jsonSchema, provider, model, maxTokens } = options;
    const observation = options.observation ?? new Observation();
    const outputMessages: OutputMessage[] = [];
    const maxTurns = options.maxTurns ?? 5;
    let turns = 0;
    let tokens = 0;
    let systemMessage = this.instructions;
    if (jsonSchema) {
      systemMessage += `
In your final message, you must return only a JSON object that matches the below schema with no other commentary.
<json_output_schema>
${JSON.stringify(jsonSchema, null, 2)}
</json_output_schema>
`;
    }
    while (true) {
      turns++;
      if (turns > maxTurns) {
        console.log('Max turns reached.');
        break;
      }
      if (tokens >= maxTokens) {
        console.log('Max tokens reached.');
        break;
      }

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
        observation,
        maxTokens: maxTokens - tokens,
        tools: this.tools,
        name: `turn-${turns}`,
      });
      tokens += newMessage.tokens_used;
      outputMessages.push(newMessage);
      const toolUseContentBlocks = selectToolUseBlocks(newMessage.content);
      if (toolUseContentBlocks.length === 0) break;
      for (const toolUseContentBlock of toolUseContentBlocks) {
        const toolResultContentBlocks: ToolResultContentBlock[] = [];
        const toolResultContentBlock = await this.runTool({
          toolUseContentBlock,
          messages: allMessages,
          observation,
        });
        toolResultContentBlocks.push(toolResultContentBlock);
        outputMessages.push({
          type: 'message',
          role: 'user',
          content: toolResultContentBlocks,
          tokens_used: 0,
        });
      }
    }
    if (jsonSchema) {
      const validator = new JsonValidator({
        model,
        jsonSchema,
        provider,
        observation,
        maxTokens,
      });
      const { output: validationOutput, output_text } =
        await validator.validate({
          instructions: this.instructions ?? '',
          input: JSON.stringify(messages),
          result: selectLastText(
            outputMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ),
        });
      outputMessages.push(...validationOutput);
      return {
        type: 'response',
        output: outputMessages,
        output_text,
        tokens_used: tokens,
      };
    }
    return {
      type: 'response',
      output: outputMessages,
      output_text: selectAllText(outputMessages),
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
  }): Promise<ToolResultContentBlock> {
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
      type: 'tool_result',
      tool_use_id: toolUseContentBlock.id,
      content: toolResponseContent,
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
