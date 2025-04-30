import Langfuse from 'langfuse';
import { Observation } from './Observation.js';

export class Observer {
  langfuse: Langfuse | null;
  constructor(options?: { langfuse: Langfuse }) {
    this.langfuse = options?.langfuse ?? null;
  }
  static createFromOptions(options: {
    langfuse?: {
      publicKey: string;
      secretKey: string;
    };
  }): Observer {
    if (options.langfuse) {
      return new Observer({
        langfuse: new Langfuse({
          publicKey: options.langfuse.publicKey,
          secretKey: options.langfuse.secretKey,
        }),
      });
    }
    return new Observer();
  }
  trace(options: {
    input: unknown;
    userId?: string;
    sessionId?: string;
  }): Observation {
    if (!this.langfuse) {
      return new Observation();
    }
    const trace = this.langfuse.trace({
      input: options.input,
      userId: options.userId,
      sessionId: options.sessionId,
    });
    return new Observation({
      langfuse: trace,
    });
  }
}
