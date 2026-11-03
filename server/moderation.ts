/**
 * Resume moderation gate — prompt-injection screening before any CV reaches
 * a Gemini prompt (or, via the parsed profile, the shared DiscoveryPool).
 *
 * Static, deterministic heuristics (zero model cost):
 *   1. Hidden-character density: control / zero-width / bidi characters are
 *      invisible carriers of injected payloads (white-on-white PDF text ends
 *      up here too once extracted).
 *   2. Instruction-phrase density: the classic prompt-injection vocabulary
 *      ("ignore previous instructions", "system prompt", "developer mode", …).
 *   3. Stranded base64 blobs: smuggled payload rolls often exceed line length.
 *
 * Verdicts: allow (store as normal), flag (store but surface warning),
 * reject (422 — never parsed, never stored). Every threshold is deliberately
 * conservative: a legit CV that trips the gate can be re-checked for free.
 */
export type ModerateVerdict = 'allow' | 'flag' | 'reject';

export interface ModerationResult {
  verdict: ModerateVerdict;
  reasons: string[];
}

const HIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\u2064\uFEFF]/g;

const INSTRUCTION_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)/i, 'override-the-instructions phrasing'],
  [/disregard\s+(?:the\s+)?(?:above|prior|previous|all)/i, 'disregard-above phrasing'],
  [/\bsystem\s+prompt\b/i, 'mentions "system prompt"'],
  [/you\s+are\s+now\s+(?:an?\s+)?(?:unrestricted|developer|admin|root)/i, 'attempted role replacement'],
  [/developer\s+mode\b/i, '"developer mode" jailbreak'],
  [/act\s+as\s+an?\s+unrestricted/i, '"act as unrestricted" jailbreak'],
  [/\boverride\b[^.\n]{0,24}\b(?:instructions?|rules?|policy|policies|safety)/i, 'instruction-override phrasing'],
  [/respond\s+(?:only\s+)?with\s+(?:your\s+)?(?:system|initial|hidden)/i, 'attempted prompt exfiltration'],
  [/never\s+reveal|do\s+not\s+tell\s+the\s+user/i, 'secrecy directive'],
  [/\bAPI[_ -]?key\b[^.\n]{0,24}/i, 'API-key coercion phrasing'],
];

const REJECT_HIDDEN_CHARS = 12;        // a legit CV contains essentially none
const REJECT_INSTRUCTION_HITS = 4;     // distinct hits across all patterns
const FLAG_INSTRUCTION_HITS = 1;
const LONG_B64_TOKEN = 400;            // chars in one continuous base64-ish run

export function moderateResumeText(
  text: string,
  opts: { warnOnlyWhenUnscannable?: boolean } = {},
): ModerationResult {
  const reasons = new Set<string>();
  const sample = (text || '').slice(0, 24_000); // same cap the parser uses

  // ── 1) Hidden characters ────────────────────────────────────────────────
  const hiddenHits = sample.match(HIDDEN_CHARS) || [];
  const density = sample.length > 0 ? hiddenHits.length / sample.length : 0;
  if (hiddenHits.length >= REJECT_HIDDEN_CHARS || density > 0.005) {
    reasons.add(`High density of hidden/invisible characters (${hiddenHits.length} found)`);
  }

  // ── 2) Instruction vocabulary ───────────────────────────────────────────
  let instructionHitCount = 0;
  for (const [re, label] of INSTRUCTION_PATTERNS) {
    if (re.test(sample)) {
      instructionHitCount++;
      reasons.add(`Prompt-injection phrasing detected: ${label}`);
    }
  }

  // Fuzzy near-miss counter (catches "ignore prev instructions", spacing tricks)
  const fuzzy = /(?:ignor\w{0,3}\s+.{0,12}\s+instr\w{2,}|instruct\w{2,}\s+s?is\w?)/i;
  if (fuzzy.test(sample)) instructionHitCount++;

  // ── 3) Stranded base64 payloads ─────────────────────────────────────────
  const blob = sample.match(/[A-Za-z0-9+/=]{200,}/g);
  if (blob && blob.length >= 2 && blob.some((b) => b.length >= LONG_B64_TOKEN)) {
    reasons.add('Embeds long encoded data blocks (possible smuggled payload)');
  }

  // ── Verdict ─────────────────────────────────────────────────────────────
  if (instructionHitCount >= REJECT_INSTRUCTION_HITS) {
    reasons.add(`Multiple instruction phrases (${instructionHitCount}) — treated as hostile content`);
    return { verdict: 'reject', reasons: Array.from(reasons) };
  }
  if (hiddenHits.length >= REJECT_HIDDEN_CHARS || density > 0.005) {
    return { verdict: 'reject', reasons: Array.from(reasons) };
  }
  if ((instructionHitCount > 0 && hiddenHits.length > 0) || (instructionHitCount >= 2)) {
    // A single evasion channel may be an accident; two channels together are not.
    reasons.add('Combined evasion signals (instruction phrasing + hidden characters)');
    return { verdict: 'reject', reasons: Array.from(reasons) };
  }
  if (reasons.size > 0) {
    return { verdict: 'flag', reasons: Array.from(reasons) };
  }
  return { verdict: 'allow', reasons: [] };
}
