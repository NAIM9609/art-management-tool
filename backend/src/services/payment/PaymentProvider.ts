export interface PaymentResult {
  success: boolean;
  transactionId: string;
  message?: string;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  message?: string;
  error?: string;
}

export interface WebhookValidation {
  valid: boolean;
  event?: any;
  error?: string;
}

export abstract class PaymentProvider {
  protected providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  abstract processPayment(
    amount: number,
    currency: string,
    details: Record<string, any>
  ): Promise<PaymentResult>;

  abstract refundPayment(
    transactionId: string,
    amount: number
  ): Promise<RefundResult>;

  abstract validateWebhook(
    payload: Buffer,
    signature: string
  ): Promise<WebhookValidation>;

  getName(): string {
    return this.providerName;
  }
}
