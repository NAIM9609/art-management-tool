import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ProductService } from '../../services/ProductService';
import { OrderService } from '../../services/OrderService';
import { NotificationService } from '../../services/NotificationService';
import { DynamoDBOptimized } from '../../services/dynamodb/DynamoDBOptimized';
import { CategoryRepository } from '../../services/dynamodb/repositories/CategoryRepository';
import { config } from '../../config';
import { AuthRequest } from '../../middleware/auth';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(config.uploadBaseDir, 'products');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxFileSize },
  fileFilter: (_req, file, cb) => {
    if (config.uploadAllowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

export function createAdminRoutes(
  productService: ProductService,
  orderService: OrderService,
  notificationService: NotificationService
): Router {
  const router = Router();
  const categoryDynamoDB = new DynamoDBOptimized({
    tableName: process.env.CONTENT_TABLE_NAME || 'content',
    region: process.env.AWS_REGION || 'us-east-1',
    maxRetries: 3,
    retryDelay: 100,
  });
  const categoryRepo = new CategoryRepository(categoryDynamoDB);

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
      const userId = (req as AuthRequest).user?.id.toString();
      const product = await productService.createProduct(req.body, userId);
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
      const userId = (req as AuthRequest).user?.id.toString();
      const product = await productService.updateProduct(parseInt(req.params.id), req.body, userId);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/shop/products/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).user?.id.toString();
      await productService.deleteProduct(parseInt(req.params.id), userId);
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
      const variant = await productService.updateVariant(req.params.id, req.body);
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
      const order = await orderService.getOrderById(req.params.id);
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
      const order = await orderService.updateFulfillmentStatus(req.params.id, status);
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/notifications', async (req: Request, res: Response) => {
    try {
      const { unread, last_key, per_page = 20 } = req.query;

      // Parse last_key if provided (should be JSON-encoded)
      let lastEvaluatedKey: Record<string, any> | undefined;
      if (last_key) {
        try {
          const parsed = JSON.parse(last_key as string);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return res.status(400).json({ error: 'last_key must be a plain object' });
          }
          lastEvaluatedKey = parsed;
        } catch {
          return res.status(400).json({ error: 'Invalid last_key format (must be valid JSON)' });
        }
      }

      const result = await notificationService.getNotifications(
        unread === 'true',
        lastEvaluatedKey,
        parseInt(per_page as string)
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/notifications/:id', async (req: Request, res: Response) => {
    try {
      const notification = await notificationService.getNotificationById(req.params.id);
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
      const notification = await notificationService.markAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }
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
      await notificationService.deleteNotification(req.params.id);
      res.json({ message: 'Notification deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/categories', async (req: Request, res: Response) => {
    try {
      const categories = await categoryRepo.findAllFlat(false);
      // Build parent/children tree in memory for backward-compatible response shape
      const byId = new Map(categories.map(c => [c.id, { ...c, parent: undefined as any, children: [] as any[] }]));
      for (const cat of byId.values()) {
        if (cat.parent_id) {
          const parent = byId.get(cat.parent_id);
          if (parent) {
            cat.parent = { id: parent.id, name: parent.name, slug: parent.slug };
            parent.children.push({ id: cat.id, name: cat.name, slug: cat.slug });
          }
        }
      }
      res.json(Array.from(byId.values()));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/categories', async (req: Request, res: Response) => {
    try {
      const category = await categoryRepo.create(req.body);
      res.status(201).json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/categories/:id', async (req: Request, res: Response) => {
    try {
      const category = await categoryRepo.findById(parseInt(req.params.id));
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
      const result: any = { ...category };
      if (category.parent_id) {
        result.parent = await categoryRepo.findById(category.parent_id);
      }
      const { items: children } = await categoryRepo.findByParentId(category.id);
      result.children = children;
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/categories/:id', async (req: Request, res: Response) => {
    try {
      const category = await categoryRepo.update(parseInt(req.params.id), req.body);
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/categories/:id', async (req: Request, res: Response) => {
    try {
      await categoryRepo.softDelete(parseInt(req.params.id));
      res.json({ message: 'Category deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Product Images ====================

  router.get('/shop/products/:id/images', async (req: Request, res: Response) => {
    try {
      const images = await productService.listImages(parseInt(req.params.id));
      res.json({ images });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/shop/products/:id/images', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/products/${req.file.filename}`;
      const altText = req.body.alt_text || '';
      const position = req.body.position !== undefined ? parseInt(req.body.position) : undefined;

      const image = await productService.addImage(
        parseInt(req.params.id),
        imageUrl,
        altText,
        position
      );

      res.status(201).json({ message: 'Image uploaded', image });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch('/shop/products/:id/images/:imageId', async (req: Request, res: Response) => {
    try {
      const image = await productService.updateImage(
        parseInt(req.params.id),
        req.params.imageId,
        req.body
      );
      res.json({ message: 'Image updated', image });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/shop/products/:id/images/:imageId', async (req: Request, res: Response) => {
    try {
      await productService.deleteImage(
        parseInt(req.params.id),
        req.params.imageId
      );
      res.json({ message: 'Image deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
