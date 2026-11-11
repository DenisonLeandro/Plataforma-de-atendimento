// Vigia de conexões "adormecidas": compara as mensagens recentes no WhatsApp
// (Evolution findMessages) com o banco. Mensagens faltantes são reenviadas ao
// evolution-webhook (mesmo caminho de processamento, com deduplicação) e, se a
// instância não recebe eventos há >10 min, a conexão é reiniciada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import { authorizeInstanceAction } from "../_shared/instance-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LOOKBACK_MIN = 20;
const SILENCE_MIN = 10;
const MAX_RESTARTS_PER_DAY = 3;
const LAG_ALERT_MIN = 15; // minutos

function extractList(p: any): any[] {
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.messages?.records)) return p.messages.records;
  if (Array.isArray(p?.records)) return p.records;
  if (Array.isArray(p?.messages)) return p.messages;
  return [];
}

async function restartInstance(apiUrl: string, id: string, apiKey: string) {
  for (const method of ["PUT", "POST"]) {
    try {
      const r = await fetchWithTimeout(`${apiUrl}/instance/restart/${id}`, { timeout: 20000, method, headers: { apikey: apiKey } });
      if (r.ok) return true;
    } catch { /* tenta próximo */ }
  }
  // fallback: connect
  try {
    const r = await fetchWithTimeout(`${apiUrl}/instance/connect/${id}`, { timeout: 20000, headers: { apikey: apiKey } });
    return r.ok;
  } catch { return false; }
}

async function checkInstance(admin: any, inst: any, opts: { force: boolean }) {
  const { data: sec } = await admin.from("whatsapp_instance_secrets").select("api_key, api_url").eq("instance_id", inst.id).maybeSingle();
  if (!sec) return { instance: inst.name, skipped: "sem credenciais" };
  const apiUrl = String(sec.api_url).replace(/\/$/, "");
  const identifier = inst.provider_type === "cloud" && inst.instance_id_external ? inst.instance_id_external : inst.instance_name;

  const since = Math.floor(Date.now() / 1000) - LOOKBACK_MIN * 60;
  let records: any[] = [];
  try {
    const r = await fetchWithTimeout(`${apiUrl}/chat/findMessages/${identifier}`, {
      timeout: 20000, method: "POST",
      headers: { apikey: sec.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ where: {}, limit: 100, page: 1 }),
    });
    if (r.ok) records = extractList(await r.json().catch(() => ({})));
  } catch (e) { console.warn("[watchdog] findMessages falhou", inst.instance_name, String(e)); }

  const recent = records.filter((m) => {
    const ts = Number(m?.messageTimestamp ?? 0);
    const jid = m?.key?.remoteJid || "";
    return m?.key?.id && ts >= since && !jid.endsWith("@broadcast") && !jid.includes("status@");
  });

  let missing: any[] = [];
  if (recent.length) {
    const ids = recent.map((m) => m.key.id);
    const { data: have } = await admin.from("whatsapp_messages").select("message_id").in("message_id", ids);
    const haveSet = new Set((have || []).map((h: any) => h.message_id));
    missing = recent.filter((m) => !haveSet.has(m.key.id));
  }

  // Reenvia faltantes ao webhook (deduplicado por message_id lá dentro).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  let recovered = 0;
  for (const m of missing.sort((a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp))) {
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/evolution-webhook`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "messages.upsert", instance: inst.instance_name, data: m, source: "watchdog" }),
      });
      if (r.ok) recovered++;
      await r.text().catch(() => "");
    } catch { /* segue */ }
  }

  // Silêncio: último messages.upsert real recebido pelo webhook.
  const { data: lastEv } = await admin.from("whatsapp_webhook_events")
    .select("created_at").eq("instance_id", inst.id).eq("event", "messages.upsert")
    .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const lastEventAt = lastEv?.created_at ? new Date(lastEv.created_at).getTime() : 0;
  const silentMin = lastEventAt ? Math.round((Date.now() - lastEventAt) / 60000) : null;

  // Atraso de entrega: quanto tempo depois de enviadas as mensagens dos clientes chegam aqui.
  // Fila atrasada no aparelho conectado só se resolve com QR Code novo.
  const { data: lagRows } = await admin.from("whatsapp_webhook_events")
    .select("created_at, ts:payload->data->>messageTimestamp, src:payload->>source")
    .eq("instance_id", inst.id).eq("event", "messages.upsert")
    .eq("payload->data->key->>fromMe", "false")
    .gte("created_at", new Date(Date.now() - 2 * 3600_000).toISOString())
    .order("created_at", { ascending: false }).limit(20);
  const lags = (lagRows || [])
    .filter((r: any) => r.src !== "watchdog" && /^\d+$/.test(String(r.ts ?? "")))
    .map((r: any) => (new Date(r.created_at).getTime() - Number(r.ts) * 1000) / 60000)
    .sort((a: number, b: number) => a - b);
  const lagMin = lags.length >= 3 ? Math.max(0, Math.round(lags[Math.floor(lags.length / 2)])) : null;
  const lagging = lagMin !== null && lagMin > LAG_ALERT_MIN;

  const meta = inst.metadata || {};
  const today = new Date().toISOString().slice(0, 10);
  let restartsToday = meta.watchdog_restart_day === today ? Number(meta.watchdog_restarts_today || 0) : 0;
  let restarted = false;

  const asleep = missing.length > 0 && (silentMin === null || silentMin >= SILENCE_MIN);
  // Socket zumbi: Evolution diz "open" mas nada chega há muito tempo.
  const lastRestart = meta.watchdog_last_restart_at ? new Date(meta.watchdog_last_restart_at).getTime() : 0;
  const hourBR = (new Date().getUTCHours() + 21) % 24;
  // Reinício por silêncio desativado: escritórios calmos ficam horas sem mensagens.
  const zombie = false && (silentMin === null || silentMin >= 90) && hourBR >= 8 && hourBR < 19
    && Date.now() - lastRestart > 60 * 60_000;
  if (asleep || zombie || opts.force) {
    restarted = await restartInstance(apiUrl, identifier, sec.api_key);
    if (restarted) restartsToday++;
  }

  const nowIso = new Date().toISOString();
  await admin.from("whatsapp_instances").update({
    metadata: {
      ...meta,
      watchdog_last_run_at: nowIso,
      watchdog_last_missing: missing.length,
      watchdog_last_recovered: recovered,
      watchdog_silent_minutes: silentMin,
      ...(recovered ? { watchdog_last_recovery_at: nowIso } : {}),
      ...(restarted ? { watchdog_last_restart_at: nowIso } : {}),
      watchdog_restart_day: today,
      watchdog_restarts_today: restartsToday,
      // Sem amostras novas, mantém a última medição de atraso.
      ...(lagMin !== null ? { delivery_lag_minutes: lagMin, delivery_lag_checked_at: nowIso } : {}),
      watchdog_requires_qr: restartsToday > MAX_RESTARTS_PER_DAY
        || (lagMin !== null ? lagging : Number(meta.delivery_lag_minutes || 0) > LAG_ALERT_MIN),
    },
  }).eq("id", inst.id);

  return { instance: inst.name, recent: recent.length, missing: missing.length, recovered, restarted, silentMin, restartsToday, lagMin };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const body = await req.json().catch(() => ({}));
    const instanceId: string | undefined = typeof body?.instanceId === "string" ? body.instanceId : undefined;

    if (instanceId) {
      const auth = await authorizeInstanceAction(admin, req, instanceId);
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const { data: inst } = await admin.from("whatsapp_instances")
        .select("id, name, instance_name, provider_type, instance_id_external, status, metadata").eq("id", instanceId).single();
      return json({ success: true, results: [await checkInstance(admin, inst, { force: true })] });
    }

    // Execução agendada: só para conexões marcadas como conectadas.
    const { data: list } = await admin.from("whatsapp_instances")
      .select("id, name, instance_name, provider_type, instance_id_external, status, metadata").eq("status", "connected");
    const results = [];
    for (const inst of list || []) {
      try { results.push(await checkInstance(admin, inst, { force: false })); }
      catch (e) { results.push({ instance: inst.name, error: String(e) }); }
    }
    console.log("[watchdog] run", JSON.stringify(results));
    return json({ success: true, results });
  } catch (e) {
    console.error("[watchdog] erro", e);
    return json({ error: "Falha no vigia de conexões" }, 500);
  }
});
