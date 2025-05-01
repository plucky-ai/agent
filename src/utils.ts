import { Ajv } from 'ajv';
import { createHash } from 'crypto';
import { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaRaw } from 'zod-to-json-schema';
import { LocalCache } from './LocalCache.js';
import { ContentBlock, OutputMessage, ToolUseBlock } from './types.js';

export function getOrderedHash(args: unknown): string {
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

export function zodToJsonSchema(
  schema: z.ZodSchema,
): ReturnType<typeof zodToJsonSchemaRaw>['definitions'][string] {
  return zodToJsonSchemaRaw(schema, 'mySchema').definitions['mySchema'];
}

export function selectToolUseBlock(
  content: string | ContentBlock[],
): ToolUseBlock | null {
  if (typeof content === 'string') {
    return null;
  }
  return content.find((block) => block.type === 'tool_use');
}

export function isValidJson(
  content: string,
  jsonSchema: unknown,
): {
  isValid: boolean;
  errors?: string;
} {
  try {
    const parsed = JSON.parse(content);
    const ajv = new Ajv();
    const validate = ajv.compile(jsonSchema);
    const valid = validate(parsed);
    return { isValid: valid, errors: String(validate.errors) };
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { isValid: false, errors: String(e) };
    }
    throw e;
  }
}

export function selectLastText(options: { messages: OutputMessage[] }): string {
  for (let i = 0; i < options.messages.length; i++) {
    const message = options.messages[options.messages.length - 1 - i];
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

export function selectAllText(options: { messages: OutputMessage[] }): string {
  return options.messages
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
