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
import mockWeatherTool from '../utils.js';

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

describe('Agent', () => {
  it('should be defined', () => {
    expect(Agent).toBeDefined();
  });

  it('should call', async () => {
    const response = await provider.fetchMessage({
      messages: [{ role: 'user', content: 'Hello world!' }],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      observation: new Observation(),
      maxTokens: 1000,
    });
    expect(response).toBeDefined();
    console.log(response);
  });

  it('should be able to get a response', async () => {
    const agent = new Agent({
      system: 'You are a friendly assistant that helps users with daily tasks.',
    });
    const response = await agent.getResponse({
      messages: [
        {
          role: 'user',
          content: 'Respond exactly with "Hello world!"',
        },
      ],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      provider,
    });
    expect(response).toBeDefined();
    expect(response.output_text).toEqual('Hello world!');
  }, 10000);

  it('should be able to get a response with a tool', async () => {
    const agent = new Agent({
      system:
        "You are a friendly assistant that helps users with daily tasks. Don't overexplain tool usage or reference tool names, though you can cite your sources. Focus on answering the user's questions.",
      tools: [mockWeatherTool],
    });
    const response = await agent.getResponse({
      messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      provider,
    });
    expect(response).toBeDefined();
    expect(response.output_text).toContain('Tokyo');
    expect(response.output_text).toContain('20');
  }, 10000);

  it('should be able to get a response with a tool and a json schema', async () => {
    const responseSchema = z.object({
      degreesCelsius: z.number(),
    });
    const agent = new Agent({
      system: 'You help users with staying up to date with the weather.',
      tools: [mockWeatherTool],
    });
    const response = await agent.getResponse({
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo in Celsius?' },
      ],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      provider,
      jsonSchema: zodToJsonSchema(responseSchema),
      maxTokens: 10000,
    });

    expect(response).toBeDefined();
    const parsed = JSON.parse(response.output_text);
    expect(parsed.degreesCelsius).toBe(20);
    expect(() => responseSchema.parse(parsed)).not.toThrow();
  }, 10000);

  it('should fix invalid JSON responses', async () => {
    const responseSchema = z.object({
      degrees: z.number(),
    });
    const agent = new Agent({
      tools: [mockWeatherTool],
    });
    const response = await agent.getValidatedJsonResponse({
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo in Celsius?' },
        {
          role: 'assistant',
          content: '{"degrees": 20',
        },
      ],
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
      provider,
      jsonSchema: zodToJsonSchema(responseSchema),
      observation: new Observation(),
      maxTokens: 2000,
    });
    expect(response).toBeDefined();
    const parsed = JSON.parse(response.output_text);
    expect(parsed.degreesCelsius).toBe(20);
    expect(() => responseSchema.parse(parsed)).not.toThrow();
  }, 10000);
});
