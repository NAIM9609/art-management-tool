import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppDataSource } from '../database/connection';
import { Fumetto } from '../entities/Fumetto';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(config.uploadBaseDir, 'fumetti');
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

export function createFumettiRoutes(): Router {
  const router = Router();
  const fumettoRepo = AppDataSource.getRepository(Fumetto);

  router.get('/', async (req: Request, res: Response) => {
    try {
      const fumetti = await fumettoRepo.find({
        order: { order: 'ASC', createdAt: 'DESC' },
      });
      res.json(fumetti);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/deleted', authMiddleware, async (req: Request, res: Response) => {
    try {
      const fumetti = await fumettoRepo.find({
        withDeleted: true,
        where: {},
      });
      const deleted = fumetti.filter(f => f.deletedAt);
      res.json(deleted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const fumetto = await fumettoRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
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
      const fumetto = fumettoRepo.create(req.body);
      await fumettoRepo.save(fumetto);
      res.status(201).json(fumetto);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await fumettoRepo.update(parseInt(req.params.id), req.body);
      const fumetto = await fumettoRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      res.json(fumetto);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await fumettoRepo.softDelete(parseInt(req.params.id));
      res.json({ message: 'Fumetto deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/restore', authMiddleware, async (req: Request, res: Response) => {
    try {
      await fumettoRepo.restore(parseInt(req.params.id));
      const fumetto = await fumettoRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      res.json(fumetto);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/:id/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const fumetto = await fumettoRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      if (!fumetto) {
        return res.status(404).json({ error: 'Fumetto not found' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/fumetti/${req.file.filename}`;
      const imageType = req.body.type || 'page';

      if (imageType === 'cover') {
        fumetto.coverImage = imageUrl;
      } else {
        const pages = fumetto.pages || [];
        pages.push(imageUrl);
        fumetto.pages = pages;
      }

      await fumettoRepo.save(fumetto);
      res.json({ message: 'Image uploaded', url: imageUrl, type: imageType, fumetto });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id/pages', authMiddleware, async (req: Request, res: Response) => {
    try {
      const fumetto = await fumettoRepo.findOne({
        where: { id: parseInt(req.params.id) },
      });
      if (!fumetto) {
        return res.status(404).json({ error: 'Fumetto not found' });
      }

      const { pageUrl, type } = req.body;
      if (!pageUrl) {
        return res.status(400).json({ error: 'pageUrl is required' });
      }

      if (type === 'cover') {
        if (fumetto.coverImage === pageUrl) {
          fumetto.coverImage = undefined;
        }
      } else {
        const pages = fumetto.pages || [];
        fumetto.pages = pages.filter((p) => p !== pageUrl);
      }

      await fumettoRepo.save(fumetto);
      res.json({ message: 'Page removed successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
