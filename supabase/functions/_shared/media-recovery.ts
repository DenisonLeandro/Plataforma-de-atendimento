// Core de recuperação de mídia, extraído de `fetch-message-media`.
// Reconstrói o payload {key, message} da mensagem via /chat/findMessages, pede o
// conteúdo descriptografado ao /chat/getBase64FromMediaMessage, sobe pro Storage e
// atualiza `media_url`. Reusado pelo wrapper on-demand (fetch-message-media) e pelo
// backfill em lote (backfill-historical-media).
//
// Comportamento IDÊNTICO ao fetch-message-media original (inclusive a preferência pelo
// mimetype devolvido pelo getBase64). Única adição: `timeoutMs` (default 20s) que limita
// cada chamada à Evolution (AbortController) e o upload ao Storage (withTimeout).
import { withTimeout } from "./evolution-helpers.ts";

export interface RecoverOpts {
  timeoutMs?: number;
}

export type RecoverResult =
  | { status: "success"; media_url: string; media_mimetype: string }
  | { status: "unavailable"; error: string }
  | { status: "not_media"; error: string }
  | { status: "failed"; error: string; httpStatus: number };

// POST a Evolution. Em timeout/erro de rede, devolve { ok:false } (preserva o fluxo
// "if (!ok) continue" do findMessages) em vez de lançar.
async function callEvolution(
  apiUrl: string,
  apiKey: string,
  providerType: string,
  path: string,
  body: unknown,
  timeoutMs: number,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (providerType === "cloud") headers["Authorization"] = `Bearer ${apiKey}`;
  else headers["apikey"] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw */
    }
    return { ok: res.ok, status: res.status, parsed, raw: text };
  } catch (err) {
    console.error("[media-recovery] Evolution call failed/aborted", path, String(err));
    return { ok: false, status: 0, parsed: null, raw: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function recoverMessageMedia(
  supabase: any,
  messageId: string,
  opts: RecoverOpts = {},
): Promise<RecoverResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  try {
    // 1. Load the message
    const { data: message, error: msgError } = await supabase
      .from("whatsapp_messages")
      .select(
        "id, message_id, remote_jid, is_from_me, message_type, media_mimetype, media_retry_count, conversation_id, media_status, updated_at",
      )
      .eq("id", messageId)
      .single();

    if (msgError || !message) {
      console.error("[media-recovery] message not found", msgError);
      return { status: "failed", error: "message not found", httpStatus: 404 };
    }

    if (message.message_type === "text") {
      return { status: "not_media", error: "message has no media" };
    }

    await supabase
      .from("whatsapp_messages")
      .update({ media_status: "pending", media_error: null })
      .eq("id", messageId);

    // 2. Resolve instance via conversation
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("instance_id")
      .eq("id", message.conversation_id)
      .single();

    if (!conversation) {
      return { status: "failed", error: "conversation not found", httpStatus: 404 };
    }

    const { data: instanceData } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, instance_id_external, provider_type")
      .eq("id", conversation.instance_id)
      .single();

    if (!instanceData) {
      return { status: "failed", error: "instance not found", httpStatus: 404 };
    }

    const { data: secrets } = await supabase
      .from("whatsapp_instance_secrets")
      .select("api_url, api_key")
      .eq("instance_id", instanceData.id)
      .single();

    if (!secrets) {
      return { status: "failed", error: "instance secrets not found", httpStatus: 404 };
    }

    const providerType = instanceData.provider_type || "self_hosted";
    const evolutionInstanceId =
      providerType === "cloud" && instanceData.instance_id_external
        ? instanceData.instance_id_external
        : instanceData.instance_name;

    // Some stored api_url values include the `/manager` suffix used by Evolution's
    // admin UI; chat endpoints live at the API root, so strip it.
    const apiBase = secrets.api_url.replace(/\/+$/, "").replace(/\/manager$/, "");

    // 3. Fetch the original message payload from Evolution to reconstruct {key, message}
    // Try strict (id + remoteJid) first, then fall back to id-only — Evolution sometimes
    // stores the remoteJid in a slightly different form (e.g. @lid vs @s.whatsapp.net).
    const findAttempts = [
      { where: { key: { id: message.message_id, remoteJid: message.remote_jid } } },
      { where: { key: { id: message.message_id } } },
    ];

    let record: any = null;
    let lastStatus = 0;
    let lastRaw = "";
    for (const body of findAttempts) {
      const findRes = await callEvolution(
        apiBase,
        secrets.api_key,
        providerType,
        `/chat/findMessages/${evolutionInstanceId}`,
        body,
        timeoutMs,
      );
      lastStatus = findRes.status;
      lastRaw = findRes.raw;
      if (!findRes.ok) continue;

      const list: any[] = Array.isArray(findRes.parsed)
        ? findRes.parsed
        : findRes.parsed?.messages?.records ||
          findRes.parsed?.records ||
          findRes.parsed?.data ||
          [];

      record = list.find((r) => r?.key?.id === message.message_id) || list[0];
      if (record?.key && record?.message) break;
      record = null;
    }

    if (!record) {
      console.warn(
        "[media-recovery] message payload not returned by Evolution",
        lastStatus,
        lastRaw.slice(0, 200),
      );
      // Só marca como definitivamente indisponível após >= 3 tentativas E
      // com >= 6h desde a última atualização. Caso contrário, mantém 'pending'
      // (o cron retry-pending-media volta a tentar mais tarde), evitando
      // "sumir" o áudio por um único blip da Evolution.
      const retryCount = (message.media_retry_count || 0) + 1;
      const lastUpdatedMs = message.updated_at ? new Date(message.updated_at).getTime() : 0;
      const ageMs = Date.now() - lastUpdatedMs;
      const shouldGiveUp = retryCount >= 3 && ageMs > 6 * 60 * 60 * 1000;
      await supabase
        .from("whatsapp_messages")
        .update({
          media_status: shouldGiveUp ? "unavailable" : "pending",
          media_error: shouldGiveUp
            ? "Mídia não está mais disponível no WhatsApp"
            : `Evolution não retornou payload (tentativa ${retryCount})`,
          media_retry_count: retryCount,
        })
        .eq("id", message.id);
      return shouldGiveUp
        ? { status: "unavailable", error: "Mídia não está mais disponível no WhatsApp" }
        : { status: "failed", error: "Evolution payload missing (will retry)", httpStatus: 503 };
    }

    // 4. Ask Evolution to give us the base64-decoded media
    const mediaRes = await callEvolution(
      apiBase,
      secrets.api_key,
      providerType,
      `/chat/getBase64FromMediaMessage/${evolutionInstanceId}`,
      {
        message: { key: record.key, message: record.message },
        convertToMp4: false,
      },
      timeoutMs,
    );

    if (!mediaRes.ok || !mediaRes.parsed?.base64) {
      console.error("[media-recovery] getBase64 failed", mediaRes.status, mediaRes.raw.slice(0, 300));
      await supabase
        .from("whatsapp_messages")
        .update({
          media_status: "failed",
          media_error: `media download failed (${mediaRes.status})`,
          media_retry_count: (message.media_retry_count || 0) + 1,
        })
        .eq("id", message.id);
      return { status: "failed", error: `media download failed (${mediaRes.status})`, httpStatus: 502 };
    }

    const mimetype = mediaRes.parsed.mimetype ||
      message.media_mimetype ||
      `${message.message_type}/*`;

    const base64String = (mediaRes.parsed.base64 as string).split(",").pop()!;
    const binary = atob(base64String);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimetype });

    const extension = (mimetype.split("/")[1] || "bin").split(";")[0].trim();
    const filePath = `${instanceData.instance_name}/${Date.now()}-${message.message_id}.${extension}`;

    const { error: uploadError } = await withTimeout(
      supabase.storage
        .from("whatsapp-media")
        .upload(filePath, blob, { contentType: mimetype, upsert: true }),
      timeoutMs,
      "storage upload",
    );

    if (uploadError) {
      console.error("[media-recovery] upload failed", uploadError);
      await supabase
        .from("whatsapp_messages")
        .update({ media_status: "failed", media_error: "storage upload failed" })
        .eq("id", message.id);
      return { status: "failed", error: "storage upload failed", httpStatus: 500 };
    }

    const { data: publicUrlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(filePath);

    const mediaUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        media_url: mediaUrl,
        media_mimetype: mimetype,
        media_status: "available",
        media_error: null,
      })
      .eq("id", message.id);

    if (updateError) {
      console.error("[media-recovery] db update failed", updateError);
      return { status: "failed", error: "failed to persist media url", httpStatus: 500 };
    }

    return { status: "success", media_url: mediaUrl, media_mimetype: mimetype };
  } catch (err) {
    console.error("[media-recovery] unexpected error", err);
    return { status: "failed", error: (err as Error).message, httpStatus: 500 };
  }
}
