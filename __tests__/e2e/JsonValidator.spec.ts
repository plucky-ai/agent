import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';

import { AWSAnthropicProvider, OutputMessage } from '../../src/index.js';
import { JsonValidator } from '../../src/JsonValidator.js';
import { LocalCache } from '../../src/LocalCache.js';
import { zodToJsonSchema } from '../../src/utils.js';
const DEFAULT_AWS_ANTHROPIC_MODEL =
  'us.anthropic.claude-3-5-haiku-20241022-v1:0';

function getCachePaths(): {
  readPath: string;
  writePath: string;
} {
  if (process.env.ENV === 'ci') {
    return {
      readPath: getCachePathFromFilename('cache.ci.json'),
      writePath: getCachePathFromFilename('new-cache.ci.json'),
    };
  }
  return {
    readPath: getCachePathFromFilename('cache.dev.json'),
    writePath: getCachePathFromFilename('cache.dev.json'),
  };
}

function getCachePathFromFilename(filename: string): string {
  return path.resolve(import.meta.dirname, `../../cache/${filename}`);
}
const { readPath, writePath } = getCachePaths();
const provider = new AWSAnthropicProvider({
  awsRegion: process.env.AWS_REGION!,
  awsAccessKey: process.env.AWS_ACCESS_KEY!,
  awsSecretKey: process.env.AWS_SECRET_KEY!,
  cache: new LocalCache({
    readPath,
    writePath,
  }),
});

let mockFetchMessage: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  const mockResponses: OutputMessage[] = [
    {
      type: 'message' as const,
      role: 'assistant' as const,
      content: 'Here is your JSON: {"fizz": buzz}', // First attempt with invalid JSON
      tokens_used: 10,
    },
    {
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Another attempt: {"fizz": buzz"}',
        },
      ],
      tokens_used: 10,
    },
    {
      type: 'message' as const,
      role: 'assistant' as const,
      content: '{"fizz": "buzz"} Done!',
      tokens_used: 10,
    },
  ];

  mockFetchMessage = vi.spyOn(provider, 'fetchMessage');
  mockResponses.forEach((response) => {
    mockFetchMessage.mockImplementationOnce(() => Promise.resolve(response));
  });
});

afterEach(() => {
  vi.spyOn(provider, 'fetchMessage').mockClear();
});

describe('JsonValidator', () => {
  it('should fix json in multiple attempts', async () => {
    const validator = new JsonValidator({
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      jsonSchema: zodToJsonSchema(
        z
          .object({
            fizz: z.string(),
          })
          .strict(),
      ),
      provider,
      maxAttempts: 3,
    });
    const { output, output_text } = await validator.validate({
      instructions: 'You transform foo bar into fizz buzz.',
      input: '{"foo": "bar"}',
      result: '{"fizz": "buzz}', // Start with invalid JSON
    });
    expect(output_text).toBe('{"fizz": "buzz"}');
    expect(output.length).toEqual(6); // Should have 3 rounds of user and assistant messages
    expect(mockFetchMessage).toHaveBeenCalledTimes(3); // Should have called fetchMessage twice
  });
  it('should abort after max attempts', async () => {
    const validator = new JsonValidator({
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      jsonSchema: zodToJsonSchema(z.object({ fizz: z.string() })),
      provider,
      maxAttempts: 2,
    });
    async function run(): Promise<{
      output: OutputMessage[];
      output_text: string;
    }> {
      const { output, output_text } = await validator.validate({
        instructions: 'You transform foo bar into fizz buzz.',
        input: '{"foo": "bar"}',
        result: '{"fizz": "buzz}', // Start with invalid JSON
      });
      return { output, output_text };
    }
    await expect(run).rejects.toThrow();
    expect(mockFetchMessage).toHaveBeenCalledTimes(2); // Should have called fetchMessage twice
  });
});
