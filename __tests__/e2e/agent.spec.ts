import path from 'path';
import { describe, expect, it } from 'vitest';
import { LocalCache } from '../../src/LocalCache.js';
import { AWSAnthropicProvider, Agent } from '../../src/index.js';
import { MockWeatherTool } from '../utils.js';

const DEFAULT_AWS_ANTHROPIC_MODEL =
  'us.anthropic.claude-3-sonnet-20240229-v1:0';

const provider = new AWSAnthropicProvider({
  awsRegion: 'us-east-1',
  awsAccessKey: process.env.AWS_ACCESS_KEY,
  awsSecretKey: process.env.AWS_SECRET_KEY,
  cache: new LocalCache(
    path.resolve(
      import.meta.dirname,
      `../../cache/cache.${process.env.ENV === 'ci' ? 'ci' : 'dev'}.json`,
    ),
  ),
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
});
