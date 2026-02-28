import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuditService } from '../services/AuditService';

export function createAuthRoutes(auditService?: AuditService): Router {
  const router = Router();
  const audit = auditService || new AuditService();

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;

      // Legacy credentials: artadmin / ArtM@nag3r2025!
      // Also support admin / admin for backward compatibility
      if ((username === 'artadmin' && password === 'ArtM@nag3r2025!') ||
          (username === 'admin' && password === 'admin')) {
        const userId = username === 'artadmin' ? '1' : '2';
        const token = jwt.sign(
          { id: userId, username },
          config.jwtSecret,
          { expiresIn: '24h' }
        );

        // Log successful login
        await audit.logAction(
          userId,
          'LOGIN',
          'User',
          userId,
          undefined,
          ipAddress
        ).catch(err => console.error('Failed to log audit action:', err));

        // Legacy response format: user is a string, not an object
        res.json({
          token,
          user: username,
        });
      } else {
        // Log failed login attempt
        await audit.logAction(
          'unknown',
          'LOGIN_FAILED',
          'User',
          'unknown',
          { username },
          ipAddress
        ).catch(err => console.error('Failed to log audit action:', err));

        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/logout', async (req: Request, res: Response) => {
    try {
      // Extract user from token if present
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, config.jwtSecret) as { id: string; username: string };
          const ipAddress = req.ip || req.socket.remoteAddress;

          // Log logout
          await audit.logAction(
            decoded.id.toString(),
            'LOGOUT',
            'User',
            decoded.id.toString(),
            undefined,
            ipAddress
          ).catch(err => console.error('Failed to log audit action:', err));
        } catch (err) {
          // Token invalid or expired, ignore
        }
      }

      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
