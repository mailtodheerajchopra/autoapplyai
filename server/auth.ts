import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { User } from './types.js';
import { getAuthSecret, getAdminApiKey } from './secrets.js';

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
  return getAuthSecret();
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

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Support Administrative Master Key bypass (for scripts, curl, health checks)
  const adminKeyHeader = req.headers['x-admin-key'];
  if (adminKeyHeader && typeof adminKeyHeader === 'string' && adminKeyHeader.trim() === getAdminApiKey()) {
    const adminUser = db.findUserById('usr_admin') || db.getAllUsersPublic().find(u => u.role === 'admin');
    if (adminUser) {
      req.user = db.findUserById(adminUser.id);
      next();
      return;
    }
  }

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

  let user = db.findUserById(claims.u);
  if (!user) {
    // Valid token, but this instance's snapshot may predate the user's
    // registration on another serverless instance. Re-read the durable
    // store once before rejecting, so a warm-but-stale instance cannot
    // random-401 a legitimately signed-in user.
    await db.refreshIfStale({ force: true });
    user = db.findUserById(claims.u);
  }
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Unknown session user' });
    return;
  }

  req.user = user;
  next();
}
// ---------- Role / capability guards (Milestone 1) ----------

export function hasCapability(user: User | undefined, capability: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Array.isArray(user.capabilities) && user.capabilities.includes(capability);
}

export function isEmployee(user: User | undefined): boolean {
  if (!user) return false;
  return user.role === 'employee' || user.role === 'admin' || hasCapability(user, 'can_refer');
}

export function isVerifiedEmployee(user: User | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!isEmployee(user)) return false;
  const profile = db.getEmployeeProfile(user.id);
  return !!profile && profile.emailVerified && profile.affiliationStatus === 'verified';
}

export function isRecruiter(user: User | undefined): boolean {
  if (!user) return false;
  return user.role === 'recruiter' || user.role === 'admin' || hasCapability(user, 'can_recruit');
}

export function isVerifier(user: User | undefined): boolean {
  if (!user) return false;
  return user.role === 'verifier' || user.role === 'admin' || hasCapability(user, 'can_verify');
}
// ---------- Publisher / recruiter authorization (final requirements) ----------

export function isApprovedPublisher(user: User | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.publisherStatus === 'approved';
}

export function isAuthorizedRecruiter(user: User | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.recruiterStatus === 'authorized';
}
