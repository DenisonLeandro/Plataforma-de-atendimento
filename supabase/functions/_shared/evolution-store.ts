// Helpers puros sobre registros da Evolution (testados em tests/evolutionStore.test.js).

/** Hora (ms) em que a Evolution gravou o registro, lida do cuid `id` ("c" + 8 chars base36). */
export function storedAtMs(record: any): number | null {
  const id = String(record?.id ?? "");
  if (!/^c[0-9a-z]{8}/.test(id)) return null;
  const ms = parseInt(id.slice(1, 9), 36);
  return Number.isFinite(ms) && ms > 1_500_000_000_000 ? ms : null;
}

/** Atraso (min) entre o envio pelo cliente e a gravação no servidor. */
export function storeLagMinutes(record: any): number | null {
  const st = storedAtMs(record);
  const ts = Number(record?.messageTimestamp ?? 0);
  if (!st || !ts) return null;
  return Math.max(0, (st - ts * 1000) / 60000);
}

/** Mensagens de um evento messages.set / messaging-history.set, só dos últimos `maxAgeDays`. */
export function extractHistoryMessages(data: any, nowMs = Date.now(), maxAgeDays = 7): any[] {
  const list = Array.isArray(data) ? data
    : Array.isArray(data?.messages) ? data.messages
    : Array.isArray(data?.records) ? data.records : [];
  const minTs = nowMs / 1000 - maxAgeDays * 86400;
  const seen = new Set<string>();
  return list.filter((m: any) => {
    const id = m?.key?.id;
    const jid = m?.key?.remoteJid || "";
    if (!id || seen.has(id) || jid.endsWith("@broadcast") || jid.includes("status@")) return false;
    if (Number(m?.messageTimestamp ?? 0) < minTs) return false;
    seen.add(id);
    return true;
  });
}
