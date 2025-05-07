import { z } from 'zod';
import { Agent } from '../src/Agent.js';
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
