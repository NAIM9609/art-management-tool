import { Express } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createShopRoutes } from '../handlers/shop';
import { createAdminRoutes } from '../handlers/admin';
import { createAuthRoutes } from '../handlers/auth';
import { createPersonaggiRoutes } from '../handlers/personaggi';
import { createFumettiRoutes } from '../handlers/fumetti';
import { CartService } from '../services/CartService';
import { ProductService } from '../services/ProductService';
import { OrderService } from '../services/OrderService';
import { NotificationService } from '../services/NotificationService';
import { MockPaymentProvider } from '../services/payment/MockPaymentProvider';
import { StripePaymentProvider } from '../services/payment/StripePaymentProvider';
import { EtsyPaymentProvider } from '../services/payment/EtsyPaymentProvider';
import { PaymentProvider } from '../services/payment/PaymentProvider';
import { DynamoDBOptimized } from '../services/dynamodb/DynamoDBOptimized';
import { config } from '../config';

export function setupRoutes(app: Express): void {
  const cartService = new CartService();
  const productService = new ProductService();
  const notificationService = new NotificationService();

  let paymentProvider: PaymentProvider;
  if (config.paymentProvider === 'stripe' && config.stripeApiKey) {
    paymentProvider = new StripePaymentProvider();
  } else {
    paymentProvider = new MockPaymentProvider(1, false);
  }

  let etsyPaymentProvider: PaymentProvider | undefined;
  if (config.etsy.shopName && config.etsy.shopUrl) {
    etsyPaymentProvider = new EtsyPaymentProvider(
      config.etsy.shopName,
      config.etsy.shopUrl,
      config.etsy.paymentCallbackUrl
    );
  }

  // Initialize DynamoDB client
  const dynamoDB = new DynamoDBOptimized({
    tableName: process.env.DYNAMODB_TABLE_NAME || 'art-management-tool',
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const orderService = new OrderService(dynamoDB);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/shop', createShopRoutes(cartService, productService, orderService, paymentProvider, etsyPaymentProvider));
  app.use('/api/admin', authMiddleware, createAdminRoutes(productService, orderService, notificationService));
  app.use('/api/auth', createAuthRoutes());
  app.use('/api/personaggi', createPersonaggiRoutes());
  app.use('/api/fumetti', createFumettiRoutes());

  console.log('Routes configured successfully');
}
