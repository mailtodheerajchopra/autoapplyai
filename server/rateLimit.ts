import { Request, Response, NextFunction } from 'express';

interface Bucket { count: number; resetAt: number; }

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      res.status(429).json({ error: 'Too many requests, please try again later' });
      return;
    }
    next();
  };
}
