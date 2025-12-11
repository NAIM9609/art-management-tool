import Stripe from 'stripe';
import { PaymentProvider, PaymentResult, RefundResult, WebhookValidation } from './PaymentProvider';
import { config } from '../../config';

export class StripePaymentProvider extends PaymentProvider {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor() {
    super('stripe');
    if (!config.stripeApiKey) {
      throw new Error('Stripe API key not configured');
    }
    this.stripe = new Stripe(config.stripeApiKey, {
      apiVersion: '2023-10-16',
    });
    this.webhookSecret = config.stripeWebhookSecret || '';
  }

  async processPayment(
    amount: number,
    currency: string,
    details: Record<string, any>
  ): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        payment_method: details.paymentMethodId,
        confirm: details.confirm !== false,
        metadata: details.metadata || {},
      });

      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        message: `Payment ${paymentIntent.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        transactionId: '',
        error: error.message || 'Payment processing failed',
      };
    }
  }

  async refundPayment(
    transactionId: string,
    amount: number
  ): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: transactionId,
        amount: Math.round(amount * 100),
      });

      return {
        success: refund.status === 'succeeded',
        refundId: refund.id,
        message: `Refund ${refund.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        refundId: '',
        error: error.message || 'Refund processing failed',
      };
    }
  }

  async validateWebhook(
    payload: Buffer,
    signature: string
  ): Promise<WebhookValidation> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      return {
        valid: true,
        event,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Webhook validation failed',
      };
    }
  }
}
