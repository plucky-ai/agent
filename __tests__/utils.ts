import { z } from 'zod';
import { Tool } from '../src/Tool.js';

export class MockWeatherTool extends Tool {
  constructor(private readonly degrees: number) {
    super({
      name: 'get_weather',
      description: 'Get the weather in a location using AccuWeather',
      inputSchema: z.object({
        location: z.string(),
      }),
    });
  }

  async call(input: z.infer<typeof this.inputSchema>): Promise<string> {
    return `The weather in ${input.location} is ${this.degrees} degrees.`;
  }
}
