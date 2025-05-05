import {
  LangfuseGenerationClient,
  LangfuseSpanClient,
  LangfuseTraceClient,
} from 'langfuse';
import { z } from 'zod';
import { JsonSchema7Type } from 'zod-to-json-schema';
import { Observation } from './Observation.js';
import { Tool } from './Tool.js';
export type ProviderName = 'aws-anthropic';

export const TextContentBlockSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .strict();

export const ToolUseContentBlockSchema = z
  .object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.unknown()),
  })
  .strict();

export const ToolResultContentBlockSchema = z
  .object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.string(),
  })
  .strict();

export const ContentBlockSchema = z.union([
  TextContentBlockSchema,
  ToolUseContentBlockSchema,
  ToolResultContentBlockSchema,
]);

export const InputMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
});

export const OutputMessageSchema = InputMessageSchema.extend({
  type: z.literal('message'),
});

export const ToolConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.custom<JsonSchema7Type>(),
});

export const ResponseSchema = z.object({
  type: z.literal('response'),
  output: z.array(OutputMessageSchema),
  output_text: z.string(),
});

export type Response = z.infer<typeof ResponseSchema>;

export type TextContentBlock = z.infer<typeof TextContentBlockSchema>;

export type ToolUseContentBlock = z.infer<typeof ToolUseContentBlockSchema>;

export type ToolResultContentBlock = z.infer<
  typeof ToolResultContentBlockSchema
>;

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export type InputMessage = z.infer<typeof InputMessageSchema>;

export type OutputMessage = z.infer<typeof OutputMessageSchema>;

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

export type LangfuseObservationClient =
  | LangfuseTraceClient
  | LangfuseSpanClient
  | LangfuseGenerationClient;

export type ToolCallContext = {
  id: string;
  messages: InputMessage[];
  observation: Observation;
};

export interface FetchRawMessageOptions {
  system?: string;
  model: string;
  messages: InputMessage[];
  tools?: Tool[];
  observation: Observation;
  name?: string;
}
