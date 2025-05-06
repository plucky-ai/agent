import { Ajv, AnySchema } from 'ajv';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  JsonSchema7Type,
  zodToJsonSchema as zodToJsonSchemaRaw,
} from 'zod-to-json-schema';
import { LocalCache } from './LocalCache.js';
import {
  ContentBlock,
  InputMessage,
  OutputMessage,
  ToolUseContentBlock,
} from './types.js';

export function getOrderedHash(args: unknown): string {
  if (typeof args !== 'object' || args === null) {
    return createHash('sha256').update(JSON.stringify(args)).digest('hex');
  }
  const sortedArgs = Object.keys(args)
    .sort()
    .reduce((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {});
  return createHash('sha256').update(JSON.stringify(sortedArgs)).digest('hex');
}

export function useCacheIfPresent<
  T extends (...args: unknown[]) => Promise<unknown>,
>(fn: T, cache?: LocalCache | null): T {
  return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    if (cache) {
      const cachedResult = await cache.get(args);
      if (cachedResult) return cachedResult as Awaited<ReturnType<T>>;
    }
    const result = await fn(...args);
    if (cache) {
      await cache.set(args, result);
    }
    return result as Awaited<ReturnType<T>>;
  }) as T;
}

export function selectMessageText(message: OutputMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  const text = message.content.find((content) => content.type === 'text');
  if (!text) {
    throw new Error('No text found in message');
  }
  return text.text;
}

export function zodToJsonSchema(schema: z.ZodSchema): JsonSchema7Type {
  return zodToJsonSchemaRaw(schema, 'mySchema')?.definitions?.[
    'mySchema'
  ] as JsonSchema7Type;
}

export function selectToolUseBlock(
  content: string | ContentBlock[],
): ToolUseContentBlock | null {
  if (typeof content === 'string') {
    return null;
  }
  return content.find((block) => block.type === 'tool_use') ?? null;
}

export async function isValidJson(
  content: string,
  jsonSchema: unknown,
): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  try {
    const parsed = JSON.parse(content);
    const ajv = new Ajv();
    const validate = ajv.compile(jsonSchema as AnySchema);
    const valid = await validate(parsed);
    return {
      isValid: Boolean(valid),
      errors: validate.errors?.map((error) => error.message ?? '') ?? [],
    };
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { isValid: false, errors: [String(e)] };
    }
    throw e;
  }
}

export function selectLastText(
  messages: (InputMessage | OutputMessage)[],
): string {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[messages.length - 1 - i];
    if (typeof message.content === 'string') {
      return message.content;
    }
    for (let j = 0; j < message.content.length; j++) {
      const contentBlock = message.content[message.content.length - 1 - j];
      if (contentBlock.type === 'text') {
        return contentBlock.text;
      }
    }
  }
  throw new Error('No text found in messages');
}

export function selectAllText(messages: OutputMessage[]): string {
  return messages
    .filter((message) => message.role === 'assistant')
    .map((message) => {
      if (typeof message.content === 'string') {
        return message.content;
      }
      return message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');
    })
    .join('\n\n');
}
