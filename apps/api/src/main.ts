import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/json-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Nest's default colored console logger stays for local dev (a
    // person is actually watching `pnpm dev:api` live); production gets
    // JSON lines instead, which is what a log aggregator can parse.
    logger: process.env.NODE_ENV === 'production' ? new JsonLogger() : undefined,
  });

  // Without this, Nest never calls onModuleDestroy() on SIGTERM/SIGINT —
  // PrismaService/RedisService would never get a chance to close their
  // connections cleanly on a container restart or rolling deploy, only
  // ever have them cut mid-request when the process is killed outright.
  app.enableShutdownHooks();

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
