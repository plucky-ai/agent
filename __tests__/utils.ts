import path from 'path';
import { z } from 'zod';
import { Agent } from '../src/Agent.js';
import { LocalCache } from '../src/LocalCache.js';
import { AnthropicProvider } from '../src/providers/AnthropicProvider.js';
import { AWSAnthropicProvider } from '../src/providers/AWSAnthropicProvider.js';
import { AzureOpenAIProvider } from '../src/providers/AzureOpenAIProvider.js';
import { BaseProvider } from '../src/providers/BaseProvider.js';
import { OpenAIProvider } from '../src/providers/OpenAIProvider.js';
import { Tool } from '../src/Tool.js';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
export const DEFAULT_AWS_ANTHROPIC_MODEL =
  'us.anthropic.claude-3-5-haiku-20241022-v1:0';

export const mockWeatherTool = new Tool(
  {
    name: 'get_current_weather',
    description:
      'Get the current weather in a location. Call this when a user asks for the weather.',
    inputSchema: z.object({
      location: z.string(),
    }),
  },
  async (input) => {
    return `The weather in ${input.location} is 20 degrees Celsius.`;
  },
);

export const mockWeatherAgent = new Agent({
  instructions: 'You help users with staying up to date with the weather.',
  tools: [mockWeatherTool],
});

export function getModelInfo(
  name: 'openai' | 'anthropic' | 'aws-anthropic' | 'azure-openai',
): {
  provider: BaseProvider;
  model: string;
} {
  const { readPath, writePath } = getCachePaths();
  const cache = new LocalCache({
    readPath,
    writePath,
  });
  if (name === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      provider: new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        cache,
      }),
      model: DEFAULT_OPENAI_MODEL,
    };
  }
  if (name === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return {
      provider: new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
        cache,
      }),
      model: DEFAULT_ANTHROPIC_MODEL,
    };
  }
  if (
    name === 'aws-anthropic' &&
    process.env.AWS_ACCESS_KEY &&
    process.env.AWS_SECRET_KEY &&
    process.env.AWS_REGION
  ) {
    return {
      provider: new AWSAnthropicProvider({
        awsAccessKey: process.env.AWS_ACCESS_KEY,
        awsSecretKey: process.env.AWS_SECRET_KEY,
        awsRegion: process.env.AWS_REGION,
        cache,
      }),
      model: DEFAULT_AWS_ANTHROPIC_MODEL,
    };
  }
  if (name === 'azure-openai' && process.env.AZURE_OPENAI_API_KEY) {
    return {
      provider: new AzureOpenAIProvider({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
        cache,
      }),
      model: '',
    };
  }
  return {
    provider: new BaseProvider({
      cache,
    }),
    model: '',
  };
}

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
  if (process.env.UPDATE_CI_CACHE === 'true') {
    return {
      readPath: getCachePathFromFilename('cache.ci.json'),
      writePath: getCachePathFromFilename('cache.ci.json'),
    };
  }
  return {
    readPath: getCachePathFromFilename('cache.dev.json'),
    writePath: getCachePathFromFilename('cache.dev.json'),
  };
}

function getCachePathFromFilename(filename: string): string {
  return path.resolve(import.meta.dirname, `../cache/${filename}`);
}
