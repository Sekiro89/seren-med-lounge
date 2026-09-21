import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Liveness (getHealth) only proves the process is up — it says
   * nothing about whether it can actually serve a request. This checks
   * the two things every real request needs: Postgres and Redis are
   * both reachable right now. An orchestrator should route traffic on
   * this, not on /health.
   */
  async getReadiness(): Promise<{ status: 'ok'; db: 'ok'; redis: 'ok' }> {
    const [db, redis] = await Promise.allSettled([
      this.prisma.client.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);

    if (db.status === 'rejected' || redis.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        db: db.status === 'fulfilled' ? 'ok' : 'unreachable',
        redis: redis.status === 'fulfilled' ? 'ok' : 'unreachable',
      });
    }

    return { status: 'ok', db: 'ok', redis: 'ok' };
  }
}
