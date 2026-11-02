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

// ─── Stateless session tokens ────────────────────────────────────────────────
// Serverless functions share no memory between instances, so sessions are
// signed (HMAC-SHA256) payloads instead of server-side state. Every instance
// verifies the same token independently — no random 401s across invocations.
//
// Signed token layout:  tok_<base64url payload>.<base64url signature>
//   payload = { v: 1, u: userId, e: expiryEpochMs }

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Dev convenience only — production MUST set AUTH_SECRET (e.g. in Vercel env vars).
    console.warn("[auth] AUTH_SECRET not set — falling back to an ephemeral dev secret. Sessions reset on redeploy.");
    return 'dev-only-insecure-secret-' + (process.env.NODE_ENV || 'development');
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signToken(payload: object): string {
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', authSecret()).update(encodedPayload).digest('base64url');
  return `tok_${encodedPayload}.${signature}`;
}

interface TokenClaims {
  v: number;
  u: string;
  e: number;
}

function verifyToken(token: string): TokenClaims | null {
  if (!token.startsWith('tok_')) return null;
  const parts = token.slice(4).split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', authSecret())
    .update(encodedPayload)
    .digest('base64url');
  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims: TokenClaims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    if (claims.v !== 1 || typeof claims.u !== 'string' || typeof claims.e !== 'number') return null;
    if (claims.e < Date.now()) return null; // expired
    return claims;
  } catch {
    return null;
  }
}

export function generateToken(userId: string): string {
  return signToken({ v: 1, u: userId, e: Date.now() + SESSION_TTL_MS });
}

// Stateless tokens cannot be individually revoked server-side; production
// revocation happens by rotating AUTH_SECRET (invalidates all sessions at once)
// or by adding a deny-list store alongside Supabase later if logouts matter.
export function revokeToken(_token: string): void {
  // Intentional no-op under the stateless scheme. Kept for call-site compatibility.
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const claims = verifyToken(token);
  if (!claims) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const user = db.findUserById(claims.u);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Unknown session user' });
    return;
  }

  req.user = user;
  next();
}
