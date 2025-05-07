import { LangfuseTraceClient } from 'langfuse-core';
import { LangfuseObservationClient } from './types.js';

export class Observation {
  private readonly langfuse: LangfuseObservationClient | null;
  constructor(options?: { langfuse: LangfuseObservationClient }) {
    this.langfuse = options?.langfuse ?? null;
  }
  generation(options: {
    input: unknown;
    model?: string;
    modelParameters?: {
      maxTokens?: number;
    };
  }): Observation {
    if (this.langfuse) {
      return new Observation({
        langfuse: this.langfuse.generation({
          input: options.input,
          model: options.model,
          modelParameters: options.modelParameters,
        }),
      });
    }
    return new Observation();
  }
  update(options: { input: unknown }): void {
    if (!this.langfuse) {
      return;
    }
    this.langfuse.update({ input: options.input });
  }
  end(options: { output: unknown }): void {
    if (!this.langfuse) {
      return;
    }
    if (this.langfuse instanceof LangfuseTraceClient) {
      this.langfuse.update({ output: options.output });
    } else {
      this.langfuse.end({ output: options.output });
    }
  }
}
