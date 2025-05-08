import path from 'path';
import { z } from 'zod';
import { Agent } from '../src/Agent.js';
import { LocalCache } from '../src/LocalCache.js';
import { BaseProvider } from '../src/providers/BaseProvider.js';
import { OpenAIProvider } from '../src/providers/OpenAIProvider.js';
import { Tool } from '../src/Tool.js';
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

export function getProvider(): BaseProvider {
  const { readPath, writePath } = getCachePaths();

  const cache = new LocalCache({
    readPath,
    writePath,
  });
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
      cache,
    });
  }
  return new BaseProvider({
    cache,
  });
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
  return {
    readPath: getCachePathFromFilename('cache.dev.json'),
    writePath: getCachePathFromFilename('cache.dev.json'),
  };
}

function getCachePathFromFilename(filename: string): string {
  return path.resolve(import.meta.dirname, `../../cache/${filename}`);
}
