import { Router, Request, Response } from 'express';
import multer from 'multer';
import { DynamoDBOptimized } from '../services/dynamodb/DynamoDBOptimized';
import { FumettoRepository } from '../services/dynamodb/repositories/FumettoRepository';
import { S3Service } from '../services/s3/S3Service';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxFileSize },
  fileFilter: (_req, file, cb) => {
    if (config.uploadAllowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

function getS3KeyFromUrl(imageUrl: string | undefined | null): string | null {
  if (!imageUrl) {
    return null;
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      const parsed = new URL(imageUrl);
      return parsed.pathname.replace(/^\/+/, '') || null;
    } catch {
      return null;
    }
  }

  return imageUrl.replace(/^\/+/, '') || null;
}

export function createFumettiRoutes(): Router {
  const router = Router();
  const dynamoDB = new DynamoDBOptimized({
    tableName: process.env.CONTENT_TABLE_NAME || 'content',
    region: process.env.AWS_REGION_CUSTOM,
    maxRetries: 3,
    retryDelay: 100,
  });
  const repo = new FumettoRepository(dynamoDB);

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const { items } = await repo.findAll({}, false);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/deleted', authMiddleware, async (_req: Request, res: Response) => {
    try {
      const { items } = await repo.findAll({}, true);
      res.json(items.filter(f => f.deleted_at));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const fumetto = await repo.findById(parseInt(req.params.id));
      if (!fumetto) {
        return res.status(404).json({ error: 'Fumetto not found' });
      }
      res.json(fumetto);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const fumetto = await repo.create(req.body);
      res.status(201).json(fumetto);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      const fumetto = await repo.update(parseInt(req.params.id), req.body);
      if (!fumetto) {
        return res.status(404).json({ error: 'Fumetto not found' });
      }
      res.json(fumetto);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await repo.softDelete(parseInt(req.params.id));
      res.json({ message: 'Fumetto deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/restore', authMiddleware, async (req: Request, res: Response) => {
    try {
      const fumetto = await repo.restore(parseInt(req.params.id));
      if (!fumetto) {
        return res.status(404).json({ error: 'Fumetto not found' });
      }
      res.json(fumetto);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const fumetto = await repo.findById(id);
      if (!fumetto) {
        return res.status(404).json({ error: 'Fumetto not found' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const s3Service = new S3Service();
      const { cdnUrl: imageUrl, key } = await s3Service.uploadImage(
        req.file.buffer,
        'uploads/fumetti',
        req.file.originalname,
        req.file.mimetype
      );
      const imageType = req.body.type || 'page';

      let updated;
      if (imageType === 'cover') {
        updated = await repo.update(id, { coverImage: imageUrl });
      } else {
        const pages = [...(fumetto.pages || []), imageUrl];
        updated = await repo.update(id, { pages });
      }

      res.json({ message: 'Image uploaded', url: imageUrl, key, type: imageType, fumetto: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id/pages', authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const fumetto = await repo.findById(id);
      if (!fumetto) {
        return res.status(404).json({ error: 'Fumetto not found' });
      }

      const { pageUrl, type } = req.body;
      if (!pageUrl) {
        return res.status(400).json({ error: 'pageUrl is required' });
      }

      if (type === 'cover') {
        if (fumetto.coverImage === pageUrl) {
          await repo.update(id, { coverImage: undefined });

          const key = getS3KeyFromUrl(pageUrl);
          if (key) {
            const s3Service = new S3Service();
            try {
              await s3Service.deleteImage(key);
            } catch (error) {
              console.warn(`Failed to delete S3 cover image ${key}:`, error);
            }
          }
        }
      } else {
        const pages = (fumetto.pages || []).filter(p => p !== pageUrl);
        await repo.update(id, { pages });

        const key = getS3KeyFromUrl(pageUrl);
        if (key) {
          const s3Service = new S3Service();
          try {
            await s3Service.deleteImage(key);
          } catch (error) {
            console.warn(`Failed to delete S3 page image ${key}:`, error);
          }
        }
      }

      res.json({ message: 'Page removed successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

