import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { AuditService } from '../services/AuditService';

export function createAuthRoutes(auditService?: AuditService): Router {
  const router = Router();
  const audit = auditService || new AuditService();

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const isValidUser =
        username === config.adminUsername &&
        config.adminPasswordHash &&
        (await bcrypt.compare(password, config.adminPasswordHash));

      if (isValidUser) {
        const userId = 1;
        const token = jwt.sign(
          { id: userId, username },
          config.jwtSecret,
          { expiresIn: '24h' }
        );

        // Log successful login (non-blocking)
        audit.logAction(
          userId.toString(),
          'LOGIN',
          'User',
          userId.toString(),
          undefined,
          ipAddress
        ).catch(err => console.error('Failed to log audit action:', err));

        res.json({
          token,
          user: username,
        });
      } else {
        // Log failed login attempt (non-blocking)
        audit.logAction(
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
          const decoded = jwt.verify(token, config.jwtSecret) as { id: number; username: string };
          const ipAddress = req.ip || req.socket.remoteAddress;

          // Log logout (non-blocking)
          audit.logAction(
            decoded.id.toString(),
            'LOGOUT',
            'User',
            decoded.id.toString(),
            undefined,
            ipAddress
          ).catch(err => console.error('Failed to log audit action:', err));
        } catch {
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
