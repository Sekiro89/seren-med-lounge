import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // @nestjs/jwt types `signOptions.expiresIn` as a template-literal
        // `StringValue` (from the `ms` package), not plain `string` — an
        // env var is always a plain `string` at this boundary, so this
        // cast just bridges that to their narrower type.
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TTL', '15m') } as NonNullable<
          JwtModuleOptions['signOptions']
        >,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // Re-exports JwtModule so JwtAuthGuard — a plain provider in AppModule,
  // not something that imports AuthModule itself — can inject JwtService.
  // AppModule importing AuthModule is what makes this reachable.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
