import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import { logAiUsage } from "../_shared/ai-usage.ts";

// Esta função usa o endpoint dedicado de speech-to-text, que não devolve
// `usage` — o log fica com 0 tokens / custo 0 (ver AI_MODEL abaixo).
const AI_MODEL = "openai/gpt-4o-mini-transcribe";

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

function knownTranscriptionError(error: string, message: string, extra: Record<string, unknown> = {}) {
  return json({ success: false, error, message, ...extra }, 200);
}

type ServiceClient = ReturnType<typeof createClient>;

function clearTranscriptionError(metadata: Record<string, unknown>) {
  const { transcription_error: _ignored, ...rest } = metadata;
  return rest;
}

async function markTranscriptionFailure(
  supabase: ServiceClient,
  messageId: string,
  status: string,
  error: string,
  message: string,
  currentMetadata: Record<string, unknown> = {},
) {
  await supabase
    .from("whatsapp_messages")
    .update({
      transcription_status: status,
      metadata: {
        ...currentMetadata,
        transcription_error: {
          code: error,
          message,
          at: new Date().toISOString(),
        },
      },
    })
    .eq("id", messageId);
}

function mimetypeToExt(mt: string | null | undefined): { ext: string; mime: string } {
  const lower = (mt ?? "").toLowerCase();
  if (lower.includes("ogg") || lower.includes("opus")) return { ext: "ogg", mime: "audio/ogg" };
  if (lower.includes("webm")) return { ext: "webm", mime: "audio/webm" };
  if (lower.includes("mp3") || lower.includes("mpeg")) return { ext: "mp3", mime: "audio/mpeg" };
  if (lower.includes("wav")) return { ext: "wav", mime: "audio/wav" };
  if (lower.includes("m4a") || lower.includes("mp4") || lower.includes("aac")) return { ext: "m4a", mime: "audio/mp4" };
  if (lower.includes("flac")) return { ext: "flac", mime: "audio/flac" };
  return { ext: "ogg", mime: "audio/ogg" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let supabase: ServiceClient | null = null;
  let messageId: string | null = null;
  let currentMetadata: Record<string, unknown> = {};

  try {
    const body = await req.json();
    messageId = body?.messageId ?? null;
    if (!messageId) return json({ error: "messageId is required" }, 400);

    supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[transcribe-audio] missing LOVABLE_API_KEY");
      return json({ error: "AI not configured" }, 500);
    }

    const { data: message, error: msgError } = await supabase
      .from("whatsapp_messages")
      .select("id, company_id, conversation_id, message_type, media_url, media_mimetype, transcription_status, audio_transcription, metadata")
      .eq("id", messageId)
      .single();

    if (msgError || !message) {
      console.error("[transcribe-audio] message not found", msgError);
      return json({ error: "message not found" }, 404);
    }

    if (message.message_type !== "audio") {
      return json({ error: "not an audio message" }, 400);
    }
    if (!message.media_url) {
      return json({ error: "no media_url" }, 400);
    }
    if (message.transcription_status === "completed" && message.audio_transcription) {
      return json({ success: true, transcription: message.audio_transcription, cached: true });
    }

    currentMetadata = (message.metadata ?? {}) as Record<string, unknown>;

    await supabase
      .from("whatsapp_messages")
      .update({
        transcription_status: "processing",
        metadata: {
          ...clearTranscriptionError(currentMetadata),
          transcription_requested_at: new Date().toISOString(),
        },
      })
      .eq("id", messageId);

    // Download the audio via Storage SDK (bypasses bucket policies using service role).
    // The public URL format is: <SUPABASE_URL>/storage/v1/object/public/whatsapp-media/<path>
    let arrayBuffer: ArrayBuffer | null = null;
    const marker = "/whatsapp-media/";
    const idx = message.media_url.indexOf(marker);
    if (idx !== -1) {
      const path = decodeURIComponent(message.media_url.slice(idx + marker.length).split("?")[0]);
      const { data: fileData, error: dlError } = await supabase.storage
        .from("whatsapp-media")
        .download(path);
      if (dlError || !fileData) {
        console.error("[transcribe-audio] storage download failed", dlError, "path:", path);
      } else {
        arrayBuffer = await fileData.arrayBuffer();
      }
    }
    // Fallback: direct fetch (works if bucket is public)
    if (!arrayBuffer) {
      const audioRes = await fetchWithTimeout(message.media_url, { timeout: 45000 });
      if (!audioRes.ok) {
        console.error("[transcribe-audio] failed to fetch audio", audioRes.status, message.media_url);
        await markTranscriptionFailure(
          supabase,
          messageId,
          "media_unavailable",
          "media_unavailable",
          `Não foi possível baixar o áudio (${audioRes.status}).`,
          currentMetadata,
        );
        return json({ error: `failed to fetch audio (${audioRes.status})` }, 502);
      }
      arrayBuffer = await audioRes.arrayBuffer();
    }
    const bytes = new Uint8Array(arrayBuffer);
    // Pre-validation: provider cap (~25MB). Avoid spending credits on a call
    // we know will fail.
    const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
    if (bytes.length > MAX_AUDIO_BYTES) {
      console.error("[transcribe-audio] audio too large:", bytes.length);
      await markTranscriptionFailure(
        supabase,
        messageId,
        "audio_too_large",
        "audio_too_large",
        `Áudio muito grande (${(bytes.length / 1024 / 1024).toFixed(1)}MB).`,
        currentMetadata,
      );
      return knownTranscriptionError(
        "audio_too_large",
        `Áudio muito grande (${(bytes.length / 1024 / 1024).toFixed(1)}MB). Máximo ${MAX_AUDIO_BYTES / 1024 / 1024}MB.`,
        { maxBytes: MAX_AUDIO_BYTES },
      );
    }

    // Use the dedicated speech-to-text endpoint (cheaper and purpose-built).
    // Model: openai/gpt-4o-mini-transcribe via multipart/form-data.
    const { ext, mime } = mimetypeToExt(message.media_mimetype);
    const audioBlob = new Blob([bytes], { type: mime });
    const form = new FormData();
    form.append("model", AI_MODEL);
    form.append("file", audioBlob, `audio.${ext}`);

    const aiRes = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      timeout: 45000,
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: form,
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("[transcribe-audio] AI gateway error", aiRes.status, errText.slice(0, 400));
      if (errText.includes("credit_limit_reached") || errText.includes("credits_exhausted")) {
        const message = "Limite diário de créditos de IA atingido. A transcrição fica pausada; tente novamente quando o limite renovar.";
        await markTranscriptionFailure(supabase, messageId, "credits_exhausted", "credits_exhausted", message, currentMetadata);
        return knownTranscriptionError(
          "credits_exhausted",
          message,
        );
      }
      if (aiRes.status === 429) {
        const message = "Muitas requisições de transcrição agora. Tente novamente em alguns segundos.";
        await markTranscriptionFailure(supabase, messageId, "rate_limited", "rate_limited", message, currentMetadata);
        return knownTranscriptionError("rate_limited", message);
      }
      if (aiRes.status === 402) {
        const message = "Limite diário de créditos de IA atingido. A transcrição fica pausada; tente novamente quando o limite renovar.";
        await markTranscriptionFailure(supabase, messageId, "credits_exhausted", "credits_exhausted", message, currentMetadata);
        return knownTranscriptionError("credits_exhausted", message);
      }
      if (aiRes.status === 400) {
        const message = "Formato de áudio não suportado pelo provedor.";
        await markTranscriptionFailure(supabase, messageId, "invalid_audio", "invalid_audio", message, currentMetadata);
        return knownTranscriptionError("invalid_audio", message);
      }
      await markTranscriptionFailure(
        supabase,
        messageId,
        "failed",
        `ai_error_${aiRes.status}`,
        `Erro da IA (${aiRes.status}).`,
        currentMetadata,
      );
      return json({ error: `ai_error_${aiRes.status}`, message: `Erro da IA (${aiRes.status}).` }, 502);
    }

    const aiJson = await aiRes.json().catch(() => null) as { text?: string } | null;
    const transcription = (aiJson?.text ?? "").trim();

    // Log de custo (fire-and-forget)
    logAiUsage({
      supabase,
      companyId: message.company_id,
      feature: "transcription",
      model: AI_MODEL,
      aiJson,
      conversationId: message.conversation_id,
      messageId,
    });

    if (!transcription) {
      console.error("[transcribe-audio] empty transcription", JSON.stringify(aiJson).slice(0, 400));
      await markTranscriptionFailure(
        supabase,
        messageId,
        "failed",
        "empty_transcription",
        "Não foi possível transcrever o áudio.",
        currentMetadata,
      );
      return knownTranscriptionError("empty_transcription", "Não foi possível transcrever o áudio.");
    }

    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        audio_transcription: transcription,
        transcription_status: "completed",
        metadata: clearTranscriptionError(currentMetadata),
      })
      .eq("id", messageId);

    if (updateError) {
      console.error("[transcribe-audio] update error", updateError);
      return json({ error: "failed to save transcription" }, 500);
    }

    return json({ success: true, transcription });
  } catch (err) {
    console.error("[transcribe-audio] unexpected", err);
    if (supabase && messageId) {
      await markTranscriptionFailure(
        supabase,
        messageId,
        "failed",
        "unexpected_error",
        (err as Error).message,
        currentMetadata,
      ).catch((updateError) => console.error("[transcribe-audio] failed to mark error", updateError));
    }
    return json({ error: (err as Error).message }, 500);
  }
});