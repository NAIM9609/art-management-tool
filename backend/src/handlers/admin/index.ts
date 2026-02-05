import { Router, Request, Response } from 'express';
import { ProductService } from '../../services/ProductService';
import { OrderService } from '../../services/OrderService';
import { NotificationService } from '../../services/NotificationService';
import { AppDataSource } from '../../database/connection';
import { Category } from '../../entities/Category';

export function createAdminRoutes(
  productService: ProductService,
  orderService: OrderService,
  notificationService: NotificationService
): Router {
  const router = Router();

  router.get('/shop/products', async (req: Request, res: Response) => {
    try {
      const { page = 1, per_page = 20 } = req.query;
      const result = await productService.listProducts({}, parseInt(page as string), parseInt(per_page as string));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/shop/products', async (req: Request, res: Response) => {
    try {
      const product = await productService.createProduct(req.body);
      res.status(201).json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/shop/products/:id', async (req: Request, res: Response) => {
    try {
      const product = await productService.getProductById(parseInt(req.params.id));
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/shop/products/:id', async (req: Request, res: Response) => {
    try {
      const product = await productService.updateProduct(parseInt(req.params.id), req.body);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/shop/products/:id', async (req: Request, res: Response) => {
    try {
      await productService.deleteProduct(parseInt(req.params.id));
      res.json({ message: 'Product deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/shop/products/:id/variants', async (req: Request, res: Response) => {
    try {
      const variant = await productService.addVariant(parseInt(req.params.id), req.body);
      res.status(201).json(variant);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch('/shop/variants/:id', async (req: Request, res: Response) => {
    try {
      const variant = await productService.updateVariant(parseInt(req.params.id), req.body);
      res.json(variant);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/shop/inventory/adjust', async (req: Request, res: Response) => {
    try {
      const { adjustments } = req.body;
      await productService.updateInventory(adjustments);
      res.json({ message: 'Inventory updated' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/shop/orders', async (req: Request, res: Response) => {
    try {
      const { status, page = 1, per_page = 20 } = req.query;
      const filters: any = {};
      if (status) filters.paymentStatus = status;
      
      const result = await orderService.listOrders(filters, parseInt(page as string), parseInt(per_page as string));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/shop/orders/:id', async (req: Request, res: Response) => {
    try {
      const order = await orderService.getOrderById(parseInt(req.params.id));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/shop/orders/:id/fulfillment', async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const order = await orderService.updateFulfillmentStatus(parseInt(req.params.id), status);
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/notifications', async (req: Request, res: Response) => {
    try {
      const { unread, page = 1, per_page = 20 } = req.query;
      const result = await notificationService.getNotifications(
        unread === 'true',
        parseInt(page as string),
        parseInt(per_page as string)
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/notifications/:id', async (req: Request, res: Response) => {
    try {
      const notification = await notificationService.getNotificationById(parseInt(req.params.id));
      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }
      res.json(notification);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/notifications/:id/read', async (req: Request, res: Response) => {
    try {
      const notification = await notificationService.markAsRead(parseInt(req.params.id));
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/notifications/read-all', async (req: Request, res: Response) => {
    try {
      await notificationService.markAllAsRead();
      res.json({ message: 'All notifications marked as read' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/notifications/:id', async (req: Request, res: Response) => {
    try {
      await notificationService.deleteNotification(parseInt(req.params.id));
      res.json({ message: 'Notification deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/categories', async (req: Request, res: Response) => {
    try {
      const categoryRepo = AppDataSource.getRepository(Category);
      const categories = await categoryRepo.find({ relations: ['parent', 'children'] });
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/categories', async (req: Request, res: Response) => {
    try {
      const categoryRepo = AppDataSource.getRepository(Category);
      const category = categoryRepo.create(req.body);
      await categoryRepo.save(category);
      res.status(201).json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/categories/:id', async (req: Request, res: Response) => {
    try {
      const categoryRepo = AppDataSource.getRepository(Category);
      const category = await categoryRepo.findOne({
        where: { id: parseInt(req.params.id) },
        relations: ['parent', 'children'],
      });
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
      res.json(category);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/categories/:id', async (req: Request, res: Response) => {
    try {
      const categoryRepo = AppDataSource.getRepository(Category);
      await categoryRepo.update(parseInt(req.params.id), req.body);
      const category = await categoryRepo.findOne({ where: { id: parseInt(req.params.id) } });
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/categories/:id', async (req: Request, res: Response) => {
    try {
      const categoryRepo = AppDataSource.getRepository(Category);
      await categoryRepo.softDelete(parseInt(req.params.id));
      res.json({ message: 'Category deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
