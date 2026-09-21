import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Single Redis connection for the app. Used today by the JWT logout
 * blacklist (auth/auth.service.ts, common/guards/jwt-auth.guard.ts) —
 * see docs/architecture/security.md#token-revocation. BullMQ (job
 * queues, per the original architecture doc) would share this same
 * connection pattern when it's introduced; not built yet, nothing needs
 * it.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    // Fail fast in tests/short-lived scripts rather than retrying
    // forever against a Redis that was never going to come up.
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
