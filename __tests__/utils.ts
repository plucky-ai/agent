import { z } from 'zod';
import { Tool } from '../src/Tool.js';
const mockWeatherTool = new Tool(
  {
    name: 'get_weather',
    description:
      'Get the weather in a location using AccuWeather. Call this when a user asks for the weather.',
    inputSchema: z.object({
      location: z.string(),
    }),
  },
  async (input) => {
    return `The weather in ${input.location} is 20 degrees Celsius.`;
  },
);

export default mockWeatherTool;
