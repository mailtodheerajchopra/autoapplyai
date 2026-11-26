export function isEmail(v: unknown): boolean {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function requireFields(body: any, fields: string[]): string | null {
  for (const f of fields) {
    if (body == null || body[f] === undefined || body[f] === null || body[f] === '') return `${f} is required`;
  }
  return null;
}

export function clampString(v: unknown, max = 5000): string {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}
