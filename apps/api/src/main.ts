import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { JsonLogger } from './common/json-logger.service';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';

// Before NestFactory.create(), per Sentry's own Node SDK guidance — it
// needs to be initialized before the rest of the app's instrumentable
// code runs. A no-op if SENTRY_DSN isn't set: every Sentry.* call used
// elsewhere (SentryExceptionFilter) is a documented safe no-op without
// init, so there's exactly one code path whether or not this is
// configured — not "wired for prod, skipped for dev" branching to keep
// in sync. See docs/architecture/deployment.md for what's verified here
// versus what still needs a real account to confirm.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Nest's default colored console logger stays for local dev (a
    // person is actually watching `pnpm dev:api` live); production gets
    // JSON lines instead, which is what a log aggregator can parse.
    logger: process.env.NODE_ENV === 'production' ? new JsonLogger() : undefined,
  });

  // TLS itself terminates in front of this process (a reverse proxy or
  // the host's load balancer — not decided yet, see
  // docs/architecture/deployment.md#not-done-yet), so Express never sees
  // an actual HTTPS connection. Without `trust proxy`, it also can't
  // trust that one proxy's `X-Forwarded-*` headers, which breaks two
  // things: the rate limiter would see every request as coming from the
  // proxy's own IP (see docs/architecture/security.md#rate-limiting),
  // and req.secure would always read false even over real HTTPS. "1"
  // means exactly one hop is trusted — the single reverse proxy this
  // topology assumes; a deployment with an additional CDN/edge layer in
  // front of that needs to raise this number, see Express's own
  // trust-proxy docs. Not enabled in development — there's no proxy
  // in front of `pnpm dev:api`, so trusting one would be meaningless
  // (and if the dev server were ever exposed directly, actively wrong).
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Without this, Nest never calls onModuleDestroy() on SIGTERM/SIGINT —
  // PrismaService/RedisService would never get a chance to close their
  // connections cleanly on a container restart or rolling deploy, only
  // ever have them cut mid-request when the process is killed outright.
  app.enableShutdownHooks();

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));

  // Applied before CORS/routes deliberately — standard security headers
  // (CSP, X-Frame-Options, etc.) on every response, including error
  // responses. Swagger UI (/docs) needs its CSP relaxed slightly —
  // configured below rather than disabling CSP app-wide for its sake.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Swagger UI's bundled page uses inline <script>/<style> —
          // scoped to what it actually needs, not a blanket allowance.
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
      // Explicit rather than accepting Helmet's default unreviewed: 2
      // years (in seconds) is what browsers/hstspreload.org expect for a
      // domain that intends to submit to the preload list later, and
      // includeSubDomains matches this app living on subdomains of one
      // parent domain (api./patient./staff.). preload itself stays
      // false — submitting to the hardcoded browser preload list is a
      // one-way, domain-owner decision (mistakes are very hard to
      // reverse) that shouldn't be flipped on by an app default; see
      // docs/architecture/security.md#encryption-in-transit. Harmless on
      // localhost in development — browsers ignore HSTS for localhost
      // and bare IP addresses, so no environment branching needed here.
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: false },
    }),
  );

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Every route documented here is still auth-gated as normal — this
  // isn't a data exposure by itself — but there's no reason to publish
  // the full API surface/schema to the public internet in production.
  // NODE_ENV isn't set by anything in this app; it's whatever the
  // deploy environment sets (see docs/architecture/deployment.md).
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SereneMed API')
      .setDescription('Backend API for the SereneMed Lounge digital clinic operating system')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
