import type {
  CapturePaymentInput,
  CreateConnectedAccountInput,
  CreateOrderInput,
  CreateTransferInput,
  PaymentProvider,
  ProviderConnectedAccount,
  ProviderOrder,
  ProviderPayment,
  ProviderRefund,
  ProviderTransfer,
  ProviderTransferReversal,
  RefundPaymentInput,
  ReverseTransferInput,
} from './provider';

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock_provider';
  readonly supportedCurrencies = ['INR', 'USD'] as const;

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    return {
      id: `order_mock_${Date.now()}`,
      amountCents: input.amountCents,
      amountPaidCents: 0,
      amountDueCents: input.amountCents,
      currency: input.currency,
      status: 'created',
      receipt: input.receipt || null,
    };
  }

  async fetchOrder(orderId: string): Promise<ProviderOrder> {
    return {
      id: orderId,
      amountCents: 1000,
      amountPaidCents: 0,
      amountDueCents: 1000,
      currency: 'INR',
      status: 'created',
      receipt: null,
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<ProviderPayment> {
    return {
      id: input.paymentId,
      orderId: null,
      amountCents: input.amountCents,
      amountCapturedCents: input.amountCents,
      amountRefundedCents: 0,
      currency: input.currency,
      status: 'captured',
      method: 'card',
      feeCents: 0,
      taxCents: 0,
      errorCode: null,
      errorDescription: null,
      errorReason: null,
    };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    return {
      id: paymentId,
      orderId: null,
      amountCents: 1000,
      amountCapturedCents: 1000, // Mock it as captured so confirmation succeeds!
      amountRefundedCents: 0,
      currency: 'INR',
      status: 'captured',
      method: 'card',
      feeCents: 0,
      taxCents: 0,
      errorCode: null,
      errorDescription: null,
      errorReason: null,
    };
  }

  async createTransfer(input: CreateTransferInput): Promise<ProviderTransfer> {
    return {
      id: `trf_mock_${Date.now()}`,
      sourceId: input.sourcePaymentId,
      destinationAccountId: input.destinationAccountId,
      amountCents: input.amountCents,
      amountReversedCents: 0,
      currency: input.currency,
      status: 'processed',
      settlementStatus: 'pending',
      onHold: input.onHold,
      onHoldUntil: input.onHoldUntil || null,
      recipientSettlementId: null,
      failureReason: null,
    };
  }

  async fetchTransfer(transferId: string): Promise<ProviderTransfer> {
    return {
      id: transferId,
      sourceId: null,
      destinationAccountId: 'acc_mock',
      amountCents: 1000,
      amountReversedCents: 0,
      currency: 'INR',
      status: 'processed',
      settlementStatus: 'pending',
      onHold: true,
      onHoldUntil: null,
      recipientSettlementId: null,
      failureReason: null,
    };
  }

  async releaseTransfer(transferId: string): Promise<ProviderTransfer> {
    return {
      id: transferId,
      sourceId: null,
      destinationAccountId: 'acc_mock',
      amountCents: 1000,
      amountReversedCents: 0,
      currency: 'INR',
      status: 'processed',
      settlementStatus: 'pending',
      onHold: false,
      onHoldUntil: null,
      recipientSettlementId: null,
      failureReason: null,
    };
  }

  async holdTransfer(transferId: string, onHoldUntil?: number): Promise<ProviderTransfer> {
    return {
      id: transferId,
      sourceId: null,
      destinationAccountId: 'acc_mock',
      amountCents: 1000,
      amountReversedCents: 0,
      currency: 'INR',
      status: 'processed',
      settlementStatus: 'pending',
      onHold: true,
      onHoldUntil: onHoldUntil || null,
      recipientSettlementId: null,
      failureReason: null,
    };
  }

  async reverseTransfer(input: ReverseTransferInput): Promise<ProviderTransferReversal> {
    return {
      id: `trf_rev_mock_${Date.now()}`,
      transferId: input.transferId,
      amountCents: input.amountCents || 1000,
      currency: 'INR',
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<ProviderRefund> {
    return {
      id: `rfnd_mock_${Date.now()}`,
      paymentId: input.paymentId,
      amountCents: input.amountCents || 1000,
      currency: 'INR',
      status: 'processed',
      speedRequested: input.speed || null,
      speedProcessed: input.speed || null,
      failureReason: null,
    };
  }

  async createConnectedAccount(input: CreateConnectedAccountInput): Promise<ProviderConnectedAccount> {
    return {
      id: `acc_mock_${Date.now()}`,
      status: 'created',
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    };
  }

  async fetchConnectedAccount(accountId: string): Promise<ProviderConnectedAccount> {
    return {
      id: accountId,
      status: 'created',
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return true;
  }
}
