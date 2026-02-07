import { PaymentProvider, PaymentResult, RefundResult, WebhookValidation } from './PaymentProvider';

export class EtsyPaymentProvider extends PaymentProvider {
  private shopName: string;
  private shopUrl: string;
  private callbackUrl: string;

  constructor(shopName: string, shopUrl: string, callbackUrl: string) {
    super('etsy');
    this.shopName = shopName;
    this.shopUrl = shopUrl;
    this.callbackUrl = callbackUrl;
  }

  async processPayment(
    amount: number,
    currency: string,
    details: Record<string, any>
  ): Promise<PaymentResult> {
    const listingId = details.etsyListingId;
    const quantity = details.quantity || 1;

    if (!listingId) {
      return {
        success: false,
        transactionId: '',
        error: 'Etsy listing ID required',
      };
    }

    const checkoutUrl = `${this.shopUrl}/listing/${listingId}?quantity=${quantity}`;

    return {
      success: true,
      transactionId: `etsy_redirect_${Date.now()}`,
      message: 'Redirect to Etsy for payment',
      metadata: { checkoutUrl },
      error: undefined,
    };
  }

  async refundPayment(
    transactionId: string,
    amount: number
  ): Promise<RefundResult> {
    return {
      success: false,
      refundId: '',
      error: 'Etsy refunds must be processed through Etsy dashboard',
    };
  }

  async validateWebhook(
    payload: Buffer,
    signature: string
  ): Promise<WebhookValidation> {
    return {
      valid: false,
      error: 'Etsy webhooks not implemented',
    };
  }
}
