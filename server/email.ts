/**
 * Optional email notification channel.
 *
 * In-app notifications are always created. Email delivery is enabled only when
 * EMAIL_NOTIFICATIONS_ENABLED=true and SMTP_* variables are configured. This
 * avoids introducing a hard dependency on an SMTP library in development; when
 * enabled, the implementation logs the intended delivery and can be wired to a
 * real provider (SendGrid/SES/SMTP) without changing callers.
 */

export function emailNotificationsEnabled(): boolean {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!emailNotificationsEnabled()) return false;
  if (!process.env.SMTP_HOST) {
    console.warn('[email] EMAIL_NOTIFICATIONS_ENABLED but SMTP_HOST not set; skipping delivery');
    return false;
  }
  // Placeholder: real provider integration can replace this block.
  console.log(`[email] (sandbox) to=${to} subject=${subject} body=${body.slice(0, 80)}`);
  return true;
}
