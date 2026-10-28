// Sends through Resend. Without RESEND_API_KEY it logs and reports `skipped`.
export async function sendMail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail skipped: no RESEND_API_KEY] ${to} — ${subject}`);
    return { ok: false, skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Stableworks <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) console.error('[mail failed]', res.status, await res.text());
  return { ok: res.ok, skipped: false };
}
