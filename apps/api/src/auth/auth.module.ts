import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PatientAuthService } from './patient-auth.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { UsersModule } from '../users/users.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [
    UsersModule,
    // One-directional: auth needs PatientsService for patient login
    // lookups. PatientsModule does NOT import AuthModule back — it has
    // no JWT dependency of its own, only PrismaService (global). Keeping
    // it one-directional avoids a circular module dependency.
    PatientsModule,
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
  providers: [AuthService, PatientAuthService, TokenBlacklistService],
  // Re-exports JwtModule/TokenBlacklistService so JwtAuthGuard — a plain
  // provider in AppModule, not something that imports AuthModule itself —
  // can inject them. AppModule importing AuthModule is what makes this
  // reachable.
  exports: [AuthService, PatientAuthService, JwtModule, TokenBlacklistService],
})
export class AuthModule {}
