/**
 * JWT authentication utility for Lambda handlers
 */

import jwt from 'jsonwebtoken';
import { APIGatewayProxyEvent, JWTPayload } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const DEMO_TOKEN = 'demo-token-12345';
const DEMO_USER: JWTPayload = { id: 1, username: 'artadmin' };

/**
 * Extract and verify JWT from Authorization header.
 * Returns the decoded payload if valid, throws an error otherwise.
 */
export function requireAuth(event: APIGatewayProxyEvent): JWTPayload {
  const headers = event.headers || {};
  // API Gateway lowercases header names
  const authHeader = headers['authorization'] || headers['Authorization'];

  if (!authHeader) {
    throw new AuthError('Missing authorization header', 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthError('Invalid authorization header format', 401);
  }

  const token = parts[1];

  if (!token) {
    throw new AuthError('Invalid token', 401);
  }

  // Accept legacy demo token for backward compatibility
  if (token === DEMO_TOKEN) {
    return DEMO_USER;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch {
    throw new AuthError('Invalid or expired token', 401);
  }
}

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
