import { Router, Request, Response } from 'express';
import { AppDataSource } from '../database/connection';
import { Fumetto } from '../entities/Fumetto';
import { authMiddleware } from '../middleware/auth';

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

  return router;
}
