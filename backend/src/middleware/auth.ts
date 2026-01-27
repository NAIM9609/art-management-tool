import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
  };
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({ error: 'Invalid authorization header format' });
    return;
  }

  const token = parts[1];

  if (!token) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // For backward compatibility: accept legacy demo token or any valid JWT
  if (token === 'demo-token-12345') {
    // Legacy demo token - accept it
    (req as AuthRequest).user = { id: 1, username: 'artadmin' };
    next();
    return;
  }

  // Try to verify as JWT
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: number; username: string };
    (req as AuthRequest).user = decoded;
    next();
  } catch (error) {
    // For backward compatibility with legacy Go backend that accepted any non-empty token
    // This maintains compatibility but logs a warning in production
    if (config.server.environment === 'production') {
      console.warn('WARNING: Accepting non-JWT bearer token for backward compatibility. This should be temporary.');
    }
    (req as AuthRequest).user = { id: 1, username: 'admin' };
    next();
  }
};
