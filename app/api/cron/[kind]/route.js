import { sendReports } from '@/lib/report';
import { sendPendingDigest } from '@/lib/pending';

// Called by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req, { params }) {
  const { kind } = await params;
  if (!['weekly', 'monthly', 'pending'].includes(kind)) return Response.json({ error: 'unknown report' }, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 });
  return Response.json(kind === 'pending' ? await sendPendingDigest() : await sendReports(kind));
}
