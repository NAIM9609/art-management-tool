import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export function createAuthRoutes(): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // Legacy credentials: artadmin / ArtM@nag3r2025!
      // Also support admin / admin for backward compatibility
      if ((username === 'artadmin' && password === 'ArtM@nag3r2025!') ||
          (username === 'admin' && password === 'admin')) {
        const token = jwt.sign(
          { id: 1, username },
          config.jwtSecret,
          { expiresIn: '24h' }
        );

        // Legacy response format: user is a string, not an object
        res.json({
          token,
          user: username,
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
