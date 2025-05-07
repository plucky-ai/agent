import { v4 as uuidv4 } from 'uuid';
import { JsonValidator } from './JsonValidator.js';
import { Observation } from './Observation.js';
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
      if (turns >= maxTurns) {
        console.log('Max turns reached.');
        break;
      }
      if (maxTokens - tokens <= 0) {
        console.log('Max tokens reached.');
        break;
      }
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
        observation,
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
        observation,
      });
      outputMessages.push(toolMessage);
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
      instructions: string;
      jsonSchema: unknown;
      originalResult: string;
      originalInput: string;
      outputMessages?: OutputMessage[];
      model: string;
      observation: Observation;
      provider: BaseProvider;
      maxTokens: number;
      tokens?: number;
    },
    attempts = 0,
  ): Promise<string> {
    const {
      jsonSchema,
      model,
      originalResult,
      observation,
      provider,
      maxTokens,
      instructions,
      originalInput,
    } = options;
    let tokens = options.tokens ?? 0;
    const outputMessages = options.outputMessages ?? [];

    const lastText =
      attempts === 0
        ? originalResult
        : selectLastText(
            outputMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ).trim();
    // Select text between first and last brackets
    const selected = lastText.slice(
      lastText.indexOf('{'),
      lastText.lastIndexOf('}') + 1,
    );
    // Clean the text by removing newlines and handling escaped characters
    const { isValid, errors } = await isValidJson(selected, jsonSchema);
    if (isValid) {
      return JSON.stringify(JSON.parse(selected));
    }
    if (attempts > 0) {
      outputMessages.push({
        type: 'message',
        role: 'user',
        content: `The previous JSON response was invalid and returned the below errors. Please return a valid JSON object that matches the given schema. Respond only with the JSON object without any commentary.
<errors>
${errors.join('\n')}
</errors>`,
        tokens_used: 0,
      });
    }

    if (attempts > 1) {
      throw new Error(`Invalid JSON: ${lastText.slice(0, 100)}`);
    }
    const messages: InputMessage[] = [
      {
        role: 'user',
        content: `Below is the context of my original request. Please use this context to fix the invalid JSON response. Please return a valid JSON object that matches the given schema. Respond only with the JSON object without any commentary.
<instructions>
${instructions}
</instructions>
<original_user_input>
${originalInput}
</original_user_input>
<json_output_schema>
${JSON.stringify(jsonSchema, null, 2)}
</json_output_schema>
<invalid_json_response>
${originalResult}
</invalid_json_response>
`,
      },
      ...outputMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];
    const outputMessage = await provider.fetchMessage({
      system: `You are a JSON validator. You will be given a JSON response and a JSON schema. You will return a valid JSON object that matches the schema.`,
      messages,
      model,
      maxTokens: maxTokens - tokens,
      observation,
      name: 'structure_json',
    });
    tokens += outputMessage.tokens_used;
    outputMessages.push(outputMessage);
    return this.getValidatedJsonResponse(
      {
        originalResult,
        outputMessages,
        jsonSchema,
        model,
        observation,
        provider,
        maxTokens: options.maxTokens,
        tokens,
        instructions: options.instructions,
        originalInput: options.originalInput,
      },
      attempts + 1,
    );
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
