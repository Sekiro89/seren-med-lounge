import { Module } from '@nestjs/common';

/**
 * Surgery is implemented in the procedures module as a Procedure with
 * kind = SURGERY (same estimate -> schedule -> consent + pre-op
 * checklist -> start -> complete lifecycle, additionally gated by
 * surgery:manage). This boundary stays for surgery-only features that
 * don't fit a Procedure (e.g. OT room management) when they're needed.
 */
@Module({})
export class SurgeryModule {}
