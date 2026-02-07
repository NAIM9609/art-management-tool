import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppDataSource } from '../database/connection';
import { Personaggio } from '../entities/Personaggio';
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
  const personaggioRepo = AppDataSource.getRepository(Personaggio);

  router.get('/', async (req: Request, res: Response) => {
    try {
      const personaggi = await personaggioRepo.find({
        order: { order: 'ASC', createdAt: 'DESC' },
      });
      res.json(personaggi);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/deleted', authMiddleware, async (req: Request, res: Response) => {
    try {
      const personaggi = await personaggioRepo.find({
        withDeleted: true,
        where: {},
      });
      const deleted = personaggi.filter(p => p.deletedAt);
      res.json(deleted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const personaggio = await personaggioRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
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
      const personaggio = personaggioRepo.create(req.body);
      await personaggioRepo.save(personaggio);
      res.status(201).json(personaggio);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await personaggioRepo.update(parseInt(req.params.id), req.body);
      const personaggio = await personaggioRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      res.json(personaggio);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await personaggioRepo.softDelete(parseInt(req.params.id));
      res.json({ message: 'Personaggio deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/restore', authMiddleware, async (req: Request, res: Response) => {
    try {
      await personaggioRepo.restore(parseInt(req.params.id));
      const personaggio = await personaggioRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      res.json(personaggio);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const personaggio = await personaggioRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      if (!personaggio) {
        return res.status(404).json({ error: 'Personaggio not found' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/personaggi/${req.file.filename}`;
      const imageType = req.body.type || 'gallery';

      if (imageType === 'icon') {
        personaggio.icon = imageUrl;
      } else if (imageType === 'background') {
        personaggio.backgroundImage = imageUrl;
      } else {
        const images = personaggio.images || [];
        images.push(imageUrl);
        personaggio.images = images;
      }

      await personaggioRepo.save(personaggio);
      res.json({ message: 'Image uploaded', url: imageUrl, type: imageType, personaggio });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id/images', authMiddleware, async (req: Request, res: Response) => {
    try {
      const personaggio = await personaggioRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      if (!personaggio) {
        return res.status(404).json({ error: 'Personaggio not found' });
      }

      const { imageUrl, type } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: 'imageUrl is required' });
      }

      if (type === 'icon') {
        if (personaggio.icon === imageUrl) {
          personaggio.icon = undefined;
        }
      } else if (type === 'background') {
        if (personaggio.backgroundImage === imageUrl) {
          personaggio.backgroundImage = undefined;
        }
      } else {
        const images = personaggio.images || [];
        personaggio.images = images.filter((img) => img !== imageUrl);
      }

      await personaggioRepo.save(personaggio);
      res.json({ message: 'Image removed successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
