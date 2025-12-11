import { Router, Request, Response } from 'express';
import { AppDataSource } from '../database/connection';
import { Personaggio } from '../entities/Personaggio';
import { authMiddleware } from '../middleware/auth';

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

  return router;
}
