import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  try {
    const { messageId } = await req.json();
    if (!messageId) return json({ error: "messageId is required" }, 400);

    const supabase = createClient(
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
      .select("id, message_type, media_url, media_mimetype, transcription_status, audio_transcription")
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

    await supabase
      .from("whatsapp_messages")
      .update({ transcription_status: "processing" })
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
      const audioRes = await fetch(message.media_url);
      if (!audioRes.ok) {
        console.error("[transcribe-audio] failed to fetch audio", audioRes.status, message.media_url);
        await supabase
          .from("whatsapp_messages")
          .update({ transcription_status: "failed" })
          .eq("id", messageId);
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
      await supabase
        .from("whatsapp_messages")
        .update({ transcription_status: "failed" })
        .eq("id", messageId);
      return json({
        error: "audio_too_large",
        message: `Áudio muito grande (${(bytes.length / 1024 / 1024).toFixed(1)}MB). Máximo ${MAX_AUDIO_BYTES / 1024 / 1024}MB.`,
        maxBytes: MAX_AUDIO_BYTES,
      }, 413);
    }

    // Use the dedicated speech-to-text endpoint (cheaper and purpose-built).
    // Model: openai/gpt-4o-mini-transcribe via multipart/form-data.
    const { ext, mime } = mimetypeToExt(message.media_mimetype);
    const audioBlob = new Blob([bytes], { type: mime });
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", audioBlob, `audio.${ext}`);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: form,
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("[transcribe-audio] AI gateway error", aiRes.status, errText.slice(0, 400));
      await supabase
        .from("whatsapp_messages")
        .update({ transcription_status: "failed" })
        .eq("id", messageId);
      if (errText.includes("credit_limit_reached") || errText.includes("credits_exhausted")) {
        return knownTranscriptionError(
          "credits_exhausted",
          "Créditos de IA esgotados. Peça ao admin do workspace para aumentar o limite ou aguarde a renovação.",
        );
      }
      if (aiRes.status === 429) {
        return knownTranscriptionError("rate_limited", "Muitas requisições. Tente novamente em alguns segundos.");
      }
      if (aiRes.status === 402) {
        return knownTranscriptionError("credits_exhausted", "Créditos de IA esgotados.");
      }
      if (aiRes.status === 400) {
        return knownTranscriptionError("invalid_audio", "Formato de áudio não suportado pelo provedor.");
      }
      return json({ error: `ai_error_${aiRes.status}`, message: `Erro da IA (${aiRes.status}).` }, 502);
    }

    const aiJson = await aiRes.json().catch(() => null) as { text?: string } | null;
    const transcription = (aiJson?.text ?? "").trim();

    if (!transcription) {
      console.error("[transcribe-audio] empty transcription", JSON.stringify(aiJson).slice(0, 400));
      await supabase
        .from("whatsapp_messages")
        .update({ transcription_status: "failed" })
        .eq("id", messageId);
      return json({ error: "empty_transcription", message: "Não foi possível transcrever o áudio." }, 502);
    }

    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        audio_transcription: transcription,
        transcription_status: "completed",
      })
      .eq("id", messageId);

    if (updateError) {
      console.error("[transcribe-audio] update error", updateError);
      return json({ error: "failed to save transcription" }, 500);
    }

    return json({ success: true, transcription });
  } catch (err) {
    console.error("[transcribe-audio] unexpected", err);
    return json({ error: (err as Error).message }, 500);
  }
});