import path from 'path';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import {
  AWSAnthropicProvider,
  Agent,
  LocalCache,
  Observation,
} from '../../src/index.js';
import { zodToJsonSchema } from '../../src/utils.js';
import { MockWeatherTool } from '../utils.js';

const DEFAULT_AWS_ANTHROPIC_MODEL =
  'us.anthropic.claude-3-sonnet-20240229-v1:0';

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
  awsRegion: 'us-east-1',
  awsAccessKey: process.env.AWS_ACCESS_KEY,
  awsSecretKey: process.env.AWS_SECRET_KEY,
  cache: new LocalCache({
    readPath,
    writePath,
  }),
});

describe('Agent', () => {
  it('should be defined', () => {
    expect(Agent).toBeDefined();
  });

  it('should be able to get a response', async () => {
    const agent = new Agent({
      provider,
    });
    const response = await agent.getResponse({
      messages: [
        {
          role: 'user',
          content: 'Respond exactly with "Hello world!"',
        },
      ],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
    });
    expect(response).toBeDefined();
    expect(response.output_text).toEqual('Hello world!');
  }, 10000);

  it('should be able to get a response with a tool', async () => {
    const agent = new Agent({
      system:
        "You are a friendly assistant that helps users with daily tasks. Don't overexplain tool usage or reference tool names, though you can cite your sources. Focus on answering the user's questions.",
      provider,
      tools: [new MockWeatherTool(20)],
    });
    const response = await agent.getResponse({
      messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
    });
    expect(response).toBeDefined();
    expect(response.output_text).toContain('Tokyo');
    expect(response.output_text).toContain('20');
  }, 10000);

  it('should be able to get a response with a tool and a json schema', async () => {
    const responseSchema = z.object({
      degrees: z.number(),
    });
    const agent = new Agent({
      provider,
      tools: [new MockWeatherTool(20)],
    });
    const response = await agent.getResponse({
      messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      jsonSchema: zodToJsonSchema(responseSchema),
    });
    expect(response).toBeDefined();
    const parsed = JSON.parse(response.output_text);
    expect(parsed.degrees).toBe(20);
    expect(() => responseSchema.parse(parsed)).not.toThrow();
  }, 10000);

  it('should fix invalid JSON responses', async () => {
    const responseSchema = z.object({
      degrees: z.number(),
    });
    const agent = new Agent({
      provider,
      tools: [new MockWeatherTool(20)],
    });
    const response = await agent.getValidatedJsonResponse({
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo?' },
        {
          role: 'assistant',
          content: '{"degrees": 20',
        },
      ],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      jsonSchema: zodToJsonSchema(responseSchema),
      observation: new Observation(),
    });
    expect(response).toBeDefined();
    const parsed = JSON.parse(response.output_text);
    expect(parsed.degrees).toBe(20);
    expect(() => responseSchema.parse(parsed)).not.toThrow();
  }, 10000);
});
