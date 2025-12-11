import { Router, Request, Response } from 'express';
import { CartService } from '../../services/CartService';
import { ProductService } from '../../services/ProductService';
import { OrderService } from '../../services/OrderService';
import { PaymentProvider } from '../../services/payment/PaymentProvider';
import { PaymentStatus } from '../../entities/Order';

export function createShopRoutes(
  cartService: CartService,
  productService: ProductService,
  orderService: OrderService,
  paymentProvider: PaymentProvider,
  etsyPaymentProvider?: PaymentProvider
): Router {
  const router = Router();

  router.get('/products', async (req: Request, res: Response) => {
    try {
      const { category, search, price_min, price_max, page = 1, per_page = 20 } = req.query;
      const filters: any = { status: 'published' };
      
      if (category) filters.category = category as string;
      if (search) filters.search = search as string;
      if (price_min) filters.minPrice = parseFloat(price_min as string);
      if (price_max) filters.maxPrice = parseFloat(price_max as string);

      const result = await productService.listProducts(filters, parseInt(page as string), parseInt(per_page as string));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/products/:slug', async (req: Request, res: Response) => {
    try {
      const product = await productService.getProductBySlug(req.params.slug);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/cart', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || `session_${Date.now()}`;
      const cart = await cartService.getCart(sessionId);
      res.json(cart);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/cart/items', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || `session_${Date.now()}`;
      const { product_id, variant_id, quantity } = req.body;
      
      const cart = await cartService.addItem(sessionId, product_id, variant_id, quantity || 1);
      res.json(cart);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch('/cart/items/:id', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || `session_${Date.now()}`;
      const { quantity } = req.body;
      
      const cart = await cartService.updateItem(sessionId, parseInt(req.params.id), quantity);
      res.json(cart);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/cart/items/:id', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || `session_${Date.now()}`;
      const cart = await cartService.removeItem(sessionId, parseInt(req.params.id));
      res.json(cart);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/cart', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || `session_${Date.now()}`;
      await cartService.clearCart(sessionId);
      res.json({ message: 'Cart cleared' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/checkout', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['x-session-id'] as string || `session_${Date.now()}`;
      const checkoutData = req.body;
      
      const order = await orderService.createOrderFromCart(sessionId, checkoutData);
      
      if (checkoutData.payment_method !== 'mock') {
        const paymentResult = await paymentProvider.processPayment(
          parseFloat(order.total.toString()),
          order.currency,
          checkoutData.payment_details || {}
        );
        
        if (paymentResult.success) {
          await orderService.updatePaymentStatus(order.id, PaymentStatus.PAID, paymentResult.transactionId);
        }
      }
      
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
