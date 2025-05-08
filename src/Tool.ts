import { z } from 'zod';
import { JsonSchema7Type } from 'zod-to-json-schema';
import { ToolCallContext } from './types.js';
import { zodToJsonSchema } from './utils.js';

export class Tool<TArgs = unknown> {
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: z.ZodSchema<TArgs>;
  private readonly fn: (
    args: TArgs,
    options: ToolCallContext,
  ) => Promise<string> | string;

  constructor(
    options: {
      name: string;
      description: string;
      inputSchema?: z.ZodSchema<TArgs>;
    },
    fn: (args: TArgs, options: ToolCallContext) => Promise<string> | string,
  ) {
    this.name = options.name;
    this.description = options.description;
    this.inputSchema =
      options.inputSchema ?? (z.object({}) as unknown as z.ZodSchema<TArgs>);
    this.fn = fn;
  }

  getInputJsonSchema(): JsonSchema7Type {
    return zodToJsonSchema(this.inputSchema);
  }

  toCacheKey(): string {
    return JSON.stringify({
      name: this.name,
      description: this.description,
      inputSchema: this.getInputJsonSchema(),
    });
  }
  call(args: TArgs, context: ToolCallContext): Promise<string> | string {
    return this.fn(args, context);
  }
}
