import { Observation } from './Observation.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { InputMessage, OutputMessage } from './types.js';
import { isValidJson, selectJsonInText, selectLastText } from './utils.js';

export class JsonValidator {
  private readonly instructions: string;
  private readonly model: string;
  private readonly jsonSchema: unknown;
  private readonly provider: BaseProvider;
  private readonly inputMessages: InputMessage[];
  private readonly outputMessages: OutputMessage[];
  private tokensUsed: number;
  private observation: Observation;
  private maxTokens: number;
  private maxAttempts: number;
  private attempts: number;
  constructor(options: {
    model: string;
    jsonSchema: unknown;
    provider: BaseProvider;
    observation?: Observation;
    maxTokens?: number;
    maxAttempts?: number;
  }) {
    this.instructions = `You are a JSON validator. You help ensure responses match the request JSON schema.`;
    this.model = options.model;
    this.jsonSchema = options.jsonSchema;
    this.provider = options.provider;
    this.inputMessages = [];
    this.outputMessages = [];
    this.tokensUsed = 0;
    this.observation = options.observation ?? new Observation();
    this.maxTokens = options.maxTokens ?? 2000;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.attempts = 0;
  }
  async validate(args: {
    instructions: string;
    input: string;
    result: string;
  }): Promise<{
    output: OutputMessage[];
    output_text: string;
  }> {
    this.inputMessages.push(
      {
        role: 'user',
        content: `<instructions>${args.instructions}</instructions>
<user_input>${args.input}</user_input>`,
      },
      {
        role: 'assistant',
        content: args.result,
      },
    );
    return this.recursivelyAttemptValidation(args.result);
  }
  async recursivelyAttemptValidation(input: string): Promise<{
    output: OutputMessage[];
    output_text: string;
  }> {
    this.attempts++;

    const selected = selectJsonInText(input);
    const { isValid, errors } = await isValidJson(selected, this.jsonSchema);
    if (isValid) {
      return {
        output: this.outputMessages,
        output_text: selected,
      };
    }
    if (this.attempts > this.maxAttempts) {
      throw new Error(`Unable to validate JSON: ${input}`);
    }
    this.addErrorInputMessage(errors);
    const outputMessage = await this.provider.fetchMessage({
      system: this.instructions,
      messages: this.getAllMessages(),
      model: this.model,
      maxTokens: this.maxTokens - this.tokensUsed,
      observation: this.observation,
      name: 'structure_json',
    });
    this.addTokensUsed(outputMessage.tokens_used);
    this.pushOutputMessage(outputMessage);
    return this.recursivelyAttemptValidation(selectLastText([outputMessage]));
  }
  getAllMessages(): InputMessage[] {
    return this.inputMessages.concat(
      this.outputMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    );
  }
  pushOutputMessage(message: OutputMessage): void {
    this.outputMessages.push(message);
  }
  addTokensUsed(tokens: number): void {
    this.tokensUsed += tokens;
  }
  addErrorInputMessage(errors: string[]): void {
    this.outputMessages.push({
      role: 'user',
      content: `The JSON response contained the following errors. Can you fix them?
<errors>
  ${errors.join('\n')}
</errors>`,
      type: 'message',
      tokens_used: 0,
    });
  }
}
