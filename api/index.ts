// Vercel serverless entry — receives every /api/* request via the rewrite
// specified in vercel.json. Exports the shared Express app as a request
// handler instead of calling app.listen (serverless hosts manage the socket).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../server/app.js';

const app = createApp();

// Job discovery + resume parsing now tolerate slow free-tier model calls
// internally (25-30s races); allow the function budget to cover them.
export const maxDuration = 60;

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
