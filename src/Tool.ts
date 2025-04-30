import { z } from 'zod';
import { ToolCallOptions, ToolConfig } from './types.js';
import { zodToJsonSchema } from './utils.js';
export class Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: z.ZodSchema;
  constructor(options: {
    name: string;
    description: string;
    inputSchema?: z.ZodSchema;
  }) {
    this.name = options.name;
    this.description = options.description;
    this.inputSchema = options.inputSchema ?? z.object({});
  }
  getModelConfig(): ToolConfig {
    return {
      name: this.name,
      description: this.description,
      inputSchema: zodToJsonSchema(this.inputSchema),
    };
  }
  async call(
    _args: z.infer<this['inputSchema']>,
    _options: ToolCallOptions,
  ): Promise<string> {
    throw new Error('Not implemented');
  }
}
