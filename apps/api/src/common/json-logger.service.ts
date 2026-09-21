import { LoggerService } from '@nestjs/common';

interface LogEntry {
  level: string;
  time: string;
  message: string;
  context?: string;
  trace?: string;
}

/**
 * One JSON object per line on stdout (errors to stderr) — the format
 * log aggregators (CloudWatch, Loki, Datadog, a plain `docker logs |
 * jq`) actually parse, instead of Nest's default ANSI-colored text
 * meant for a human terminal watching `pnpm dev:api`. Used only when
 * NODE_ENV=production (see main.ts) — the colored console logger stays
 * for local dev, where a person is actually reading it live.
 *
 * No new dependency: Nest's LoggerService interface is four methods,
 * small enough to implement directly rather than pull in pino/winston
 * for a formatting change this simple.
 */
export class JsonLogger implements LoggerService {
  log(message: string, context?: string) {
    this.write('log', message, context);
  }

  error(message: string, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: string, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string) {
    this.write('verbose', message, context);
  }

  private write(level: string, message: unknown, context?: string, trace?: string) {
    const entry: LogEntry = {
      level,
      time: new Date().toISOString(),
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...(context ? { context } : {}),
      ...(trace ? { trace } : {}),
    };
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }
}
