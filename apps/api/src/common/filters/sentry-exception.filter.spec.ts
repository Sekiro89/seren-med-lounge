import { Controller, Get, INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SentryExceptionFilter } from './sentry-exception.filter';

// @sentry/node's named exports aren't configurable, so jest.spyOn can't
// redefine captureException in place — mock the whole module instead.
const captureExceptionMock = jest.fn();
jest.mock('@sentry/node', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

@Controller()
class ThrowingController {
  @Get('boom')
  boom(): never {
    throw new Error('deliberate test failure');
  }
}

describe('SentryExceptionFilter', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
    }).compile();

    app = moduleRef.createNestApplication();
    const { httpAdapter } = app.get(HttpAdapterHost);
    app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));
    await app.init();
    captureExceptionMock.mockClear();
  });

  afterEach(async () => {
    await app.close();
  });

  // What's verified here: the filter actually calls captureException on
  // a real unhandled exception passing through the real Nest HTTP
  // pipeline, and the response Nest sends back is exactly what
  // BaseExceptionFilter would send without this filter in the way (a
  // plain 500, unchanged). What's NOT verified (can't be, without a
  // real Sentry account/DSN — see docs/architecture/deployment.md): that
  // the captured exception is actually delivered anywhere.
  // captureException itself is a documented safe no-op without
  // Sentry.init() having run, so this spec doesn't need a DSN to
  // exercise the call.
  it('reports an unhandled exception to Sentry and still returns Nest’s normal 500 response', async () => {
    const response = await request(app.getHttpServer()).get('/boom');

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
  });
});
