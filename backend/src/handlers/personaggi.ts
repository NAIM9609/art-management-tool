import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { DynamoDBOptimized } from '../services/dynamodb/DynamoDBOptimized';
import { PersonaggioRepository } from '../services/dynamodb/repositories/PersonaggioRepository';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(config.uploadBaseDir, 'personaggi');
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

export function createPersonaggiRoutes(): Router {
  const router = Router();
  const dynamoDB = new DynamoDBOptimized({
    tableName: process.env.CONTENT_TABLE_NAME || 'content',
    region: process.env.AWS_REGION || 'us-east-1',
    maxRetries: 3,
    retryDelay: 100,
  });
  const repo = new PersonaggioRepository(dynamoDB);

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const personaggi = await repo.findAll(false);
      res.json(personaggi);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/deleted', authMiddleware, async (_req: Request, res: Response) => {
    try {
      const all = await repo.findAll(true);
      res.json(all.filter(p => p.deleted_at));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const personaggio = await repo.findById(parseInt(req.params.id));
      if (!personaggio) {
        return res.status(404).json({ error: 'Personaggio not found' });
      }
      res.json(personaggio);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const personaggio = await repo.create(req.body);
      res.status(201).json(personaggio);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      const personaggio = await repo.update(parseInt(req.params.id), req.body);
      if (!personaggio) {
        return res.status(404).json({ error: 'Personaggio not found' });
      }
      res.json(personaggio);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await repo.softDelete(parseInt(req.params.id));
      res.json({ message: 'Personaggio deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/restore', authMiddleware, async (req: Request, res: Response) => {
    try {
      const personaggio = await repo.restore(parseInt(req.params.id));
      if (!personaggio) {
        return res.status(404).json({ error: 'Personaggio not found' });
      }
      res.json(personaggio);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const personaggio = await repo.findById(id);
      if (!personaggio) {
        return res.status(404).json({ error: 'Personaggio not found' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/personaggi/${req.file.filename}`;
      const imageType = req.body.type || 'gallery';

      let updated;
      if (imageType === 'icon') {
        updated = await repo.update(id, { icon: imageUrl });
      } else if (imageType === 'background') {
        updated = await repo.update(id, { backgroundImage: imageUrl });
      } else {
        const images = [...(personaggio.images || []), imageUrl];
        updated = await repo.update(id, { images });
      }

      res.json({ message: 'Image uploaded', url: imageUrl, type: imageType, personaggio: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id/images', authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const personaggio = await repo.findById(id);
      if (!personaggio) {
        return res.status(404).json({ error: 'Personaggio not found' });
      }

      const { imageUrl, type } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: 'imageUrl is required' });
      }

      if (type === 'icon') {
        if (personaggio.icon === imageUrl) {
          await repo.update(id, { icon: null });
        }
      } else if (type === 'background') {
        if (personaggio.backgroundImage === imageUrl) {
          await repo.update(id, { backgroundImage: null });
        }
      } else {
        const images = (personaggio.images || []).filter(img => img !== imageUrl);
        await repo.update(id, { images });
      }

      res.json({ message: 'Image removed successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

