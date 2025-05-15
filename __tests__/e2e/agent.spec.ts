import { describe, expect, it, vi } from 'vitest';
import z from 'zod';

import { Agent } from '../../src/Agent.js';
import { Observation } from '../../src/Observation.js';
import { zodToJsonSchema } from '../../src/utils.js';
import { getModelInfo, mockWeatherAgent } from '../utils.js';

describe('Agent', () => {
  const { provider } = getModelInfo('openai');
  const model = 'gpt-4o-mini';

  it('should be defined', () => {
    expect(Agent).toBeDefined();
  });

  it('should call', async () => {
    const response = await provider.fetchMessage({
      messages: [{ role: 'user', content: 'Hello world!' }],
      model,
      observation: new Observation(),
      maxTokens: 1000,
    });
    expect(response).toBeDefined();
  });

  it('should be able to get a response with %s', async () => {
    const agent = new Agent({
      instructions:
        'You are a friendly assistant that helps users with daily tasks.',
    });
    const response = await agent.getResponse({
      messages: [
        { role: 'user', content: 'Respond exactly with "Hello world!"' },
      ],
      model,
      provider,
      maxTokensPerTurn: 5000,
    });
    expect(response).toBeDefined();
    expect(response.output_text).toEqual('Hello world!');
  }, 10000);

  it('should be able to get a response with a tool with %s', async () => {
    const response = await mockWeatherAgent.getResponse({
      messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      model,
      provider,
      maxTokensPerTurn: 5000,
    });
    expect(response).toBeDefined();
    expect(response.output_text).toContain('Tokyo');
    expect(response.output_text).toContain('20');
  }, 10000);

  it('should be able to get a response with a tool and a json schema with %s', async () => {
    const responseSchema = z.object({
      degreesCelsius: z.number(),
    });
    const response = await mockWeatherAgent.getResponse({
      messages: [
        {
          role: 'user',
          content: 'What is the weather in Tokyo in Celsius?',
        },
      ],
      model,
      provider,
      jsonSchema: zodToJsonSchema(responseSchema),
      maxTokensPerTurn: 5000,
      maxTurns: 10,
    });

    expect(response).toBeDefined();
    const parsed = JSON.parse(response.output_text);
    expect(parsed.degreesCelsius).toBe(20);
    expect(() => responseSchema.parse(parsed)).not.toThrow();
  });

  it('should trace each generation', async () => {
    const observation = new Observation();
    const generationSpy = vi.spyOn(observation, 'generation');
    const agent = new Agent({
      instructions: 'You are a helpful assistant.',
    });
    const response = await agent.getResponse({
      messages: [
        {
          role: 'user',
          content: 'Say "Hello world!" exactly.',
        },
      ],
      model,
      provider,
      observation,
      maxTokensPerTurn: 1000,
      maxTurns: 1,
    });
    expect(response).toBeDefined();
    expect(response.output_text).toEqual('Hello world!');
    expect(generationSpy).toHaveBeenCalledTimes(1);
  });
});
