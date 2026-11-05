import React from 'react';

/**
 * Public legal pages required for publishing the Google OAuth consent screen
 * (Branding → home page, privacy policy, terms of service). Rendered
 * standalone at /privacy and /terms — no auth, no dashboard chrome.
 */

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col">
      <header className="border-b border-slate-900 bg-slate-950/90">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-white">AutoApply AI</span>
          <a href="/" className="text-xs text-indigo-400 hover:text-indigo-300">← Back to app</a>
        </div>
      </header>
      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6 text-sm leading-relaxed">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-xs text-slate-500">Last updated: November 5, 2026 · Applies to www.applymatica.com</p>
          {children}
        </article>
      </main>
      <footer className="border-t border-slate-900 py-4 text-xs text-slate-500 text-center">
        <a href="/privacy" className="hover:text-slate-300">Privacy Policy</a>
        <span className="mx-2">·</span>
        <a href="/terms" className="hover:text-slate-300">Terms of Service</a>
        <span className="mx-2">·</span>
        <a href="/" className="hover:text-slate-300">www.applymatica.com</a>
      </footer>
    </div>
  );
}

function Section({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">{h}</h2>
      {children}
    </section>
  );
}

export const PrivacyPolicy: React.FC = () => (
  <LegalShell title="Privacy Policy">
    <Section h="1. Who we are">
      <p>AutoApply AI (&quot;we&quot;, &quot;the Service&quot;) is an autonomous job-discovery and Workday application assistant operated at www.applymatica.com. You can reach us at <span className="text-slate-100">mailto.dheerajchopra@gmail.com</span> for any privacy request.</p>
    </Section>
    <Section h="2. What we collect">
      <ul className="list-disc pl-5 space-y-1">
        <li><span className="text-slate-100">Account data:</span> your name, email address, and authentication method (email/password or Google sign-in).</li>
        <li><span className="text-slate-100">Resume data:</span> the CV file or text you upload, and the structured profile parsed from it (skills, work history, education).</li>
        <li><span className="text-slate-100">Job discovery data:</span> searches you run, openings surfaced for you, and your match/fit scores.</li>
        <li><span className="text-slate-100">Workday assistance data:</span> the questionnaire answers the agent drafts for your review, and portal application records you choose to stage.</li>
        <li><span className="text-slate-100">Security logs:</span> minimal audit records (sign-ins, security-relevant actions) needed to operate the platform safely.</li>
      </ul>
    </Section>
    <Section h="3. What we do NOT collect">
      <p>We do not read your Google contacts, drive, calendar, or mail. Google sign-in requests only the <span className="text-slate-100">openid, email, and profile</span> scopes — your name and email address — and nothing else. We never post anywhere on your behalf.</p>
    </Section>
    <Section h="4. How we process your data">
      <p>Your resume text and profile details are processed by AI providers (Google Gemini; Groq as a fallback) for the sole purpose of parsing your CV and matching openings. Workday credentials, where you provide them, are encrypted at rest. Data is stored in a managed Supabase (PostgreSQL) datastore.</p>
    </Section>
    <Section h="5. What we never do">
      <ul className="list-disc pl-5 space-y-1">
        <li>We never sell your personal data.</li>
        <li>We never auto-submit applications without your explicit review-and-approve step.</li>
        <li>We never apply to your current employer or companies you exclude (the Conflict Shield).</li>
      </ul>
    </Section>
    <Section h="6. Retention & deletion">
      <p>Your resume, profile, and discovery data are retained while your account is active. You can request full deletion of your account and associated data at any time by emailing <span className="text-slate-100">mailto.dheerajchopra@gmail.com</span> from your registered address; deletion completes within 30 days.</p>
    </Section>
    <Section h="7. Your choices">
      <p>You may use the Service with email/password instead of Google sign-in, decline to store Workday credentials, and export or correct your parsed profile from the Profile page at any time.</p>
    </Section>
  </LegalShell>
);

export const TermsOfService: React.FC = () => (
  <LegalShell title="Terms of Service">
    <Section h="1. Acceptance">
      <p>By creating an account or using AutoApply AI at www.applymatica.com you agree to these terms. If you do not agree, do not use the Service.</p>
    </Section>
    <Section h="2. What the Service does">
      <p>AutoApply AI parses your CV, discovers job openings from public portals, drafts Workday questionnaire answers, and stages applications for your review. <span className="text-slate-100">Every submission requires your explicit approval</span> — the agent does not auto-submit on its own.</p>
    </Section>
    <Section h="3. Your responsibilities">
      <ul className="list-disc pl-5 space-y-1">
        <li>Review every drafted answer before submission; you are responsible for the accuracy and truthfulness of what you submit to employers.</li>
        <li>Only apply to roles you are legitimately interested in; do not use the Service to spam portals.</li>
        <li>Maintain the confidentiality of your account credentials.</li>
      </ul>
    </Section>
    <Section h="4. No guarantee of employment">
      <p>The Service provides discovery and drafting assistance. We do not guarantee job offers, interview outcomes, posting accuracy, or portal availability. Job data may be incomplete or stale despite freshness filters.</p>
    </Section>
    <Section h="5. Acceptable use">
      <p>You agree not to abuse, overload, or attempt to disrupt the Service or the portals it integrates with, not to upload unlawful or malicious content (including prompt-injection payloads), and not to use the Service in violation of any portal's terms or applicable law.</p>
    </Section>
    <Section h="6. Availability & changes">
      <p>The Service is offered as-is, subject to provider quotas and availability. We may modify or discontinue features; material changes to these terms will be reflected on this page.</p>
    </Section>
    <Section h="7. Termination">
      <p>You may stop using the Service and request account deletion at any time. We may suspend accounts that abuse the Service or endanger other users or integrated platforms.</p>
    </Section>
    <Section h="8. Contact">
      <p>Questions about these terms: <span className="text-slate-100">mailto.dheerajchopra@gmail.com</span></p>
    </Section>
  </LegalShell>
);
