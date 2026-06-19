import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recoverMessageMedia } from "../_shared/media-recovery.ts";

// Backfill das mensagens cuja `media_url` ainda aponta pro CDN cru do WhatsApp (.enc),
// gravadas antes do fix da Etapa 1. Reusa o mesmo core do fetch-message-media
// (recoverMessageMedia) para descriptografar e re-hospedar no Storage.
//
// Política C: loga e pula; sem retry automático. Falha mantém a `.enc` (selecionável
// numa re-execução com cursor zerado). Sucesso vira URL do Storage e sai do filtro.
// Cursor por id ASC (avança sempre, inclusive sobre falhas) → sem loop infinito.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BATCH = 5;                 // mídias recuperadas em paralelo por lote
const DELAY_MS = 400;            // pausa entre lotes (não saturar a Evolution)
const MAX_INVOCATION_MS = 25000; // budget de wall-clock por invocação
const PAGE = 50;                 // tamanho da página do cursor
const TIMEOUT_MS = 20000;        // timeout por chamada à Evolution / upload
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Aplica os filtros das mensagens .enc a uma query (reusado na página e na contagem).
function applyEncFilter(query: any, convIds: string[] | null) {
  let q = query
    .neq("message_type", "text")
    .not("media_url", "is", null)
    // PostgREST: dentro de .or() o wildcard é `*` (equivale a %).
    .or("media_url.ilike.*.enc*,media_url.ilike.*whatsapp.net*")
    // Exclui o que já está no nosso Storage (filtro dedicado usa `%`).
    .not("media_url", "ilike", "%/whatsapp-media/%");
  if (convIds) q = q.in("conversation_id", convIds);
  return q;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const cursor: string = typeof body.cursor === "string" && body.cursor
      ? body.cursor
      : ZERO_UUID;
    const limit: number = typeof body.limit === "number" && body.limit > 0
      ? body.limit
      : Infinity;
    const instanceId: string | null = body.instance_id || null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Filtro opcional por instância: whatsapp_messages não tem instance_id, então
    // resolvemos as conversas da instância e filtramos por conversation_id.
    let convIds: string[] | null = null;
    if (instanceId) {
      const { data: convs, error } = await supabase
        .from("whatsapp_conversations")
        .select("id")
        .eq("instance_id", instanceId);
      if (error) {
        console.error("[backfill] failed to resolve instance conversations", error);
        return json({ error: "failed to resolve instance conversations" }, 500);
      }
      convIds = (convs || []).map((c: any) => c.id);
      if (convIds.length === 0) {
        return json({
          processed: 0, succeeded: 0, failed: 0, skipped: 0,
          next_cursor: cursor, done: true, remaining: 0,
        });
      }
    }

    const startedAt = Date.now();
    let processed = 0, succeeded = 0, failed = 0, skipped = 0;
    let nextCursor = cursor;
    let done = false;

    while (true) {
      if (Date.now() - startedAt > MAX_INVOCATION_MS) break;
      const pageSize = Math.min(PAGE, limit - processed);
      if (pageSize <= 0) break;

      const { data: page, error: pageErr } = await applyEncFilter(
        supabase.from("whatsapp_messages").select("id"),
        convIds,
      )
        .gt("id", nextCursor)
        .order("id", { ascending: true })
        .limit(pageSize);

      if (pageErr) {
        console.error("[backfill] page query failed", pageErr);
        return json({
          error: "page query failed",
          processed, succeeded, failed, skipped, next_cursor: nextCursor,
        }, 500);
      }

      if (!page || page.length === 0) {
        done = true;
        break;
      }

      for (let i = 0; i < page.length; i += BATCH) {
        if (Date.now() - startedAt > MAX_INVOCATION_MS) break;
        const chunk = page.slice(i, i + BATCH);
        const results = await Promise.all(
          chunk.map((m: any) => recoverMessageMedia(supabase, m.id, { timeoutMs: TIMEOUT_MS })),
        );
        for (let j = 0; j < chunk.length; j++) {
          const m = chunk[j];
          const r = results[j];
          processed++;
          if (r.status === "success") {
            succeeded++;
            console.log(JSON.stringify({ msg: m.id, status: "success" }));
          } else if (r.status === "unavailable") {
            skipped++;
            console.log(JSON.stringify({ msg: m.id, status: "skipped", reason: r.error }));
          } else {
            failed++;
            console.log(JSON.stringify({ msg: m.id, status: "failed", reason: r.error }));
          }
          nextCursor = m.id; // cursor avança sempre (inclui falhas/skips)
        }
        if (i + BATCH < page.length) await sleep(DELAY_MS);
      }

      if (processed >= limit) break;
    }

    // Contagem restante (best-effort) com o mesmo filtro, a partir do cursor atual.
    let remaining: number | null = null;
    const { count } = await applyEncFilter(
      supabase.from("whatsapp_messages").select("id", { count: "exact", head: true }),
      convIds,
    ).gt("id", nextCursor);
    remaining = count ?? null;
    if (remaining === 0) done = true;

    const summary = {
      processed, succeeded, failed, skipped,
      next_cursor: nextCursor, done, remaining,
    };
    console.log(JSON.stringify({ summary: true, ...summary }));
    return json(summary);
  } catch (err) {
    console.error("[backfill] unexpected error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
