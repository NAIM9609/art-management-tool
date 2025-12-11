import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export function createAuthRoutes(): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (username === 'admin' && password === 'admin') {
        const token = jwt.sign(
          { id: 1, username: 'admin' },
          config.jwtSecret,
          { expiresIn: '24h' }
        );

        res.json({
          token,
          user: {
            id: 1,
            username: 'admin',
          },
        });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
