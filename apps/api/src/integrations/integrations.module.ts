import { Module } from '@nestjs/common';

import { PAYMENT_PROVIDER } from './payment/payment-provider.interface';
import { StubPaymentProvider } from './payment/payment-provider.stub';
import { MESSAGING_PROVIDER } from './messaging/messaging-provider.interface';
import { StubMessagingProvider } from './messaging/messaging-provider.stub';
import { LAB_PROVIDER } from './labs/lab-provider.interface';
import { StubLabProvider } from './labs/lab-provider.stub';
import { INSURANCE_PROVIDER } from './insurance/insurance-provider.interface';
import { StubInsuranceProvider } from './insurance/insurance-provider.stub';
import { ACCOUNTING_PROVIDER } from './accounting/accounting-provider.interface';
import { StubAccountingProvider } from './accounting/accounting-provider.stub';
import { VIDEO_PROVIDER } from './video/video-provider.interface';
import { StubVideoProvider } from './video/video-provider.stub';
import { AI_PROVIDER } from './ai/ai-provider.interface';
import { StubAiProvider } from './ai/ai-provider.stub';

/**
 * Composition root for every external integration. Domain modules inject
 * the *_PROVIDER token (e.g. `@Inject(PAYMENT_PROVIDER) provider: PaymentProvider`)
 * and never import a vendor SDK or a concrete Stub* class directly.
 *
 * Today every binding points at a Stub implementation that logs and
 * refuses real work — see docs/architecture/integrations.md. Swap a
 * binding to a real adapter by changing only the `useClass` here once a
 * vendor is contracted; nothing else in the codebase changes.
 */
@Module({
  providers: [
    { provide: PAYMENT_PROVIDER, useClass: StubPaymentProvider },
    { provide: MESSAGING_PROVIDER, useClass: StubMessagingProvider },
    { provide: LAB_PROVIDER, useClass: StubLabProvider },
    { provide: INSURANCE_PROVIDER, useClass: StubInsuranceProvider },
    { provide: ACCOUNTING_PROVIDER, useClass: StubAccountingProvider },
    { provide: VIDEO_PROVIDER, useClass: StubVideoProvider },
    { provide: AI_PROVIDER, useClass: StubAiProvider },
  ],
  exports: [
    PAYMENT_PROVIDER,
    MESSAGING_PROVIDER,
    LAB_PROVIDER,
    INSURANCE_PROVIDER,
    ACCOUNTING_PROVIDER,
    VIDEO_PROVIDER,
    AI_PROVIDER,
  ],
})
export class IntegrationsModule {}
