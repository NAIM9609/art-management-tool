import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const SESSION_COOKIE_NAME = 'cart_session';
const SESSION_HEADER_NAME = 'x-cart-session';

export function getSessionToken(req: Request): string {
  // Try header first (X-Cart-Session)
  let sessionToken = req.headers[SESSION_HEADER_NAME] as string;
  
  // Fall back to cookie (cart_session)
  if (!sessionToken && req.cookies) {
    sessionToken = req.cookies[SESSION_COOKIE_NAME];
  }
  
  // Fall back to legacy header (x-session-id)
  if (!sessionToken) {
    sessionToken = req.headers['x-session-id'] as string;
  }
  
  // Generate new session if none exists
  if (!sessionToken) {
    sessionToken = `session_${uuidv4()}`;
  }
  
  return sessionToken;
}

export function setSessionCookie(res: Response, sessionToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
    path: '/',
  });
}
