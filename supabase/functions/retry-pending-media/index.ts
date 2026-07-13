// Cron-invoked worker: reprocesses recent audio/media messages stuck in
// media_status IN ('pending','failed'). Batched (up to 50 per run) and rate-
// limited by media_retry_count. Reuses the same recoverMessageMedia helper
// used by fetch-message-media, so behavior is identical to the on-demand path.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { recoverMessageMedia } from '../_shared/media-recovery.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_MAX_PER_RUN = 50;
const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_LOOKBACK_HOURS = 24;
const RECOVER_TIMEOUT_MS = 15_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Optional overrides for manual backfill runs (e.g. hoursBack=720, limit=200).
  let overrides: { hoursBack?: number; limit?: number; maxRetries?: number } = {};
  try {
    if (req.method === 'POST') overrides = (await req.json().catch(() => ({}))) as any;
    else {
      const url = new URL(req.url);
      const h = url.searchParams.get('hoursBack');
      const l = url.searchParams.get('limit');
      if (h) overrides.hoursBack = Number(h);
      if (l) overrides.limit = Number(l);
    }
  } catch { /* ignore */ }

  const lookbackHours = Math.max(1, Math.min(24 * 60, overrides.hoursBack ?? DEFAULT_LOOKBACK_HOURS));
  const perRun = Math.max(1, Math.min(500, overrides.limit ?? DEFAULT_MAX_PER_RUN));
  const maxRetries = Math.max(1, Math.min(20, overrides.maxRetries ?? DEFAULT_MAX_RETRIES));

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('whatsapp_messages')
    .select('id, message_type, media_retry_count, created_at')
    .in('media_status', ['pending', 'failed'])
    .lt('media_retry_count', maxRetries)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(perRun);

  if (error) {
    console.error('[retry-pending-media] fetch failed', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const results = {
    picked: rows?.length ?? 0,
    success: 0,
    unavailable: 0,
    failed: 0,
    skipped: 0,
  };

  // Process sequentially with a small delay so we don't hammer Evolution.
  for (const row of rows ?? []) {
    try {
      const r = await recoverMessageMedia(supabase, row.id, { timeoutMs: RECOVER_TIMEOUT_MS });
      if (r.status === 'success') results.success++;
      else if (r.status === 'unavailable') results.unavailable++;
      else if (r.status === 'not_media') results.skipped++;
      else results.failed++;
    } catch (err) {
      console.error('[retry-pending-media] recover threw', row.id, err);
      results.failed++;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log('[retry-pending-media] run summary', results);

  return new Response(
    JSON.stringify({ ok: true, ...results }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});