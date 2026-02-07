import { PaymentProvider, PaymentResult, RefundResult, WebhookValidation } from './PaymentProvider';

export class MockPaymentProvider extends PaymentProvider {
  private minAmount: number;
  private allowZero: boolean;

  constructor(minAmount: number = 1, allowZero: boolean = false) {
    super('mock');
    this.minAmount = minAmount;
    this.allowZero = allowZero;
  }

  async processPayment(
    amount: number,
    currency: string,
    details: Record<string, any>
  ): Promise<PaymentResult> {
    if (!this.allowZero && amount < this.minAmount) {
      return {
        success: false,
        transactionId: '',
        error: `Amount must be at least ${this.minAmount} ${currency}`,
      };
    }

    const shouldFail = details.simulateFailure === true;

    if (shouldFail) {
      return {
        success: false,
        transactionId: '',
        error: 'Simulated payment failure',
      };
    }

    const transactionId = `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    return {
      success: true,
      transactionId,
      message: 'Payment processed successfully (mock)',
    };
  }

  async refundPayment(
    transactionId: string,
    amount: number
  ): Promise<RefundResult> {
    if (!transactionId.startsWith('mock_')) {
      return {
        success: false,
        refundId: '',
        error: 'Invalid transaction ID for mock provider',
      };
    }

    const refundId = `refund_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    return {
      success: true,
      refundId,
      message: 'Refund processed successfully (mock)',
    };
  }

  async validateWebhook(
    payload: Buffer,
    signature: string
  ): Promise<WebhookValidation> {
    return {
      valid: true,
      event: { type: 'mock_webhook', payload: payload.toString() },
    };
  }
}
