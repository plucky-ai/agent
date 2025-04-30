import { createHash } from 'crypto';
import { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaRaw } from 'zod-to-json-schema';
import { LocalCache } from './LocalCache.js';
import { OutputMessage } from './types.js';

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
