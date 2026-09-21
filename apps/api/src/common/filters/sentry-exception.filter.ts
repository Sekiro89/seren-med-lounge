import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

/**
 * Global exception filter — reports every exception to Sentry, then
 * delegates to Nest's own BaseExceptionFilter for the actual HTTP
 * response, unchanged. This is deliberately NOT a response-shaping
 * filter: it exists purely to observe, not to alter status codes or
 * error bodies that every existing e2e assertion already depends on.
 *
 * Sentry.captureException() is a documented safe no-op if Sentry.init()
 * was never called (see main.ts — init only runs when SENTRY_DSN is
 * set), so this filter is registered unconditionally rather than
 * branching on whether Sentry is configured — one code path either way,
 * not two to keep in sync.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    Sentry.captureException(exception);
    super.catch(exception, host);
  }
}
