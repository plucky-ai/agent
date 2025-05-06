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
  private readonly instructions: string | undefined;
  private readonly observer: Observer;
  constructor(options: {
    instructions?: string;
    tools?: Tool[];
    langfuse?: {
      publicKey: string;
      secretKey: string;
    };
  }) {
    this.instructions = options.instructions;
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
      const result = await this.getValidatedJsonResponse({
        instructions: this.instructions ?? '',
        originalInput: JSON.stringify(messages),
        originalResult: selectLastText(
          messages.map((m) => ({
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
      outputMessages.push({
        type: 'message',
        role: 'assistant',
        content: result,
        tokens_used: 0,
      });
      return {
        type: 'response',
        output: outputMessages,
        output_text: result,
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
      outputMessages.length === 0
        ? originalResult
        : selectLastText(
            outputMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ).trim();
    // Clean the text by removing newlines and handling escaped characters
    const { isValid, errors } = await isValidJson(lastText, jsonSchema);
    if (isValid) {
      return lastText;
    }
    outputMessages.push({
      type: 'message',
      role: 'user',
      content: `The previous JSON response was invalid and returned the below errors. Please return a valid JSON object that matches the given schema. Respond only with the JSON object without any commentary.
<json_output_schema>
${JSON.stringify(jsonSchema, null, 2)}
</json_output_schema>
<errors>
${errors.join('\n')}
</errors>`,
      tokens_used: 0,
    });
    if (attempts > 1) {
      throw new Error(`Invalid JSON: ${lastText.slice(0, 100)}`);
    }
    const messages: InputMessage[] = [
      {
        role: 'user',
        content: `Below is the context of my original request. Please use this context to fix the JSON response.

<instructions>
${instructions}
</instructions>
<original_user_input>
${originalInput}
</original_user_input>
<original_json_response>
${originalResult}
</original_json_response>
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
