import { supabaseServer } from '@/lib/supabase/server';
import { toCsv } from '@/lib/dsr';

// CSV download of the team's DSR. Row-level security limits this to teams the user belongs to.
export async function GET(_req, { params }) {
  const { teamId } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { data, error } = await sb.from('tp_shipments').select('*').eq('team_id', teamId).order('created_at');
  if (error) return new Response('Not found', { status: 404 });
  return new Response('﻿' + toCsv(data || []), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="DSR-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
