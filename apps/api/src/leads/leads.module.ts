import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PatientsModule } from '../patients/patients.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  // PatientsModule: conversion goes through PatientsService.register's
  // duplicate detection, never a parallel patient insert.
  imports: [AuditModule, PatientsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
