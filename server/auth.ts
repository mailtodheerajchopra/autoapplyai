import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { User } from './types.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// In-memory token session mapping
const tokenSessions = new Map<string, { userId: string; expiresAt: number }>();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function generateToken(userId: string): string {
  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  tokenSessions.set(token, {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function revokeToken(token: string): void {
  tokenSessions.delete(token);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const session = tokenSessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    // If not found in memory, allow fallback for development/demo users
    if (token === 'demo_alex') {
      const alex = db.findUserByEmail('alex.chen@example.com');
      if (alex) {
        req.user = alex;
        next();
        return;
      }
    } else if (token === 'demo_priya') {
      const priya = db.findUserByEmail('priya.sharma@example.com');
      if (priya) {
        req.user = priya;
        next();
        return;
      }
    }

    res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
    return;
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }

  req.user = user;
  next();
}
