import { Router, Request, Response } from 'express';
import { CartService } from '../../services/CartService';
import { ProductService } from '../../services/ProductService';
import { OrderService } from '../../services/OrderService';
import { PaymentProvider } from '../../services/payment/PaymentProvider';
import { PaymentStatus, Order } from '../../entities/Order';
import { getSessionToken, setSessionCookie } from '../../utils/sessionHelper';

interface CheckoutResponse extends Order {
  payment_metadata?: Record<string, any>;
}

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
      // Support both min_price/max_price (legacy) and price_min/price_max
      const { category, search, min_price, max_price, price_min, price_max, page = 1, per_page = 20 } = req.query;
      const filters: any = { status: 'published' };
      
      if (category) filters.category = category as string;
      if (search) filters.search = search as string;
      
      // Use min_price/max_price if provided, otherwise fall back to price_min/price_max
      const minPrice = min_price || price_min;
      const maxPrice = max_price || price_max;
      
      if (minPrice) filters.minPrice = parseFloat(minPrice as string);
      if (maxPrice) filters.maxPrice = parseFloat(maxPrice as string);

      const currentPage = parseInt(page as string);
      const itemsPerPage = parseInt(per_page as string);
      
      const result = await productService.listProducts(filters, currentPage, itemsPerPage);
      
      // Include page and per_page in response for legacy compatibility
      res.json({
        products: result.products,
        total: result.total,
        page: currentPage,
        per_page: itemsPerPage,
      });
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
      const sessionId = getSessionToken(req);
      setSessionCookie(res, sessionId);

      const cart = await cartService.getCart(sessionId);
      const totals = await cartService.calculateTotals(cart.id);

      res.json({
        cart,
        ...totals,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/cart/items', async (req: Request, res: Response) => {
    try {
      const sessionId = getSessionToken(req);
      setSessionCookie(res, sessionId);

      const { product_id, variant_id, quantity } = req.body;

      const cart = await cartService.getOrCreateCart(sessionId);
      const updatedCart = await cartService.addItem(cart.id, product_id, variant_id, quantity || 1);
      res.json(updatedCart);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch('/cart/items/:id', async (req: Request, res: Response) => {
    try {
      const sessionId = getSessionToken(req);
      setSessionCookie(res, sessionId);

      const { quantity } = req.body;

      const cart = await cartService.getOrCreateCart(sessionId);
      const updatedCart = await cartService.updateQuantity(cart.id, parseInt(req.params.id), quantity);
      res.json(updatedCart);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/cart/items/:id', async (req: Request, res: Response) => {
    try {
      const sessionId = getSessionToken(req);
      setSessionCookie(res, sessionId);

      const cart = await cartService.getOrCreateCart(sessionId);
      const updatedCart = await cartService.removeItem(cart.id, parseInt(req.params.id));
      res.json(updatedCart);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/cart', async (req: Request, res: Response) => {
    try {
      const sessionId = getSessionToken(req);
      setSessionCookie(res, sessionId);

      const cart = await cartService.getOrCreateCart(sessionId);
      await cartService.clearCart(cart.id);
      res.json({ message: 'Cart cleared' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/checkout', async (req: Request, res: Response) => {
    try {
      const sessionId = getSessionToken(req);
      setSessionCookie(res, sessionId);
      
      // Map snake_case request body to camelCase for service layer
      const checkoutData = {
        customerEmail: req.body.email || req.body.customer_email,
        customerName: req.body.name || req.body.customer_name,
        shippingAddress: req.body.shipping_address,
        billingAddress: req.body.billing_address,
        paymentMethod: req.body.payment_method,
        notes: req.body.notes,
      };
      
      const order = await orderService.createOrderFromCart(sessionId, checkoutData);
      
      let paymentMetadata: Record<string, any> | undefined;
      
      if (checkoutData.paymentMethod !== 'mock') {
        // Select the appropriate payment provider based on payment method
        const selectedProvider = checkoutData.paymentMethod === 'etsy' && etsyPaymentProvider 
          ? etsyPaymentProvider 
          : paymentProvider;
          
        const paymentResult = await selectedProvider.processPayment(
          parseFloat(order.total.toString()),
          order.currency,
          req.body.payment_details || {}
        );
        
        if (paymentResult.success) {
          await orderService.updatePaymentStatus(order.id, PaymentStatus.PAID, paymentResult.transactionId);
        }
        
        // Include payment metadata (e.g., Etsy checkout URL) in response
        if (paymentResult.metadata) {
          paymentMetadata = paymentResult.metadata;
        }
      }
      
      // Return order with optional payment metadata
      const response: CheckoutResponse = { ...order };
      if (paymentMetadata) {
        response.payment_metadata = paymentMetadata;
      }
      
      res.json(response);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
