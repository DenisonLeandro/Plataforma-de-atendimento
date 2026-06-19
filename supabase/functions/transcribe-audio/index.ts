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

function mimetypeToFormat(mt: string | null | undefined): string {
  if (!mt) return "ogg";
  const lower = mt.toLowerCase();
  if (lower.includes("ogg") || lower.includes("opus")) return "ogg";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mp3") || lower.includes("mpeg")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("m4a") || lower.includes("mp4") || lower.includes("aac")) return "m4a";
  if (lower.includes("flac")) return "flac";
  return "ogg";
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
    // Pre-validation: Gemini inline audio cap (~20MB). Beyond this the provider rejects
    // with 400; we avoid spending credits on a call we know will fail.
    const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
    if (bytes.length > MAX_AUDIO_BYTES) {
      console.error("[transcribe-audio] audio too large:", bytes.length);
      await supabase
        .from("whatsapp_messages")
        .update({ transcription_status: "failed" })
        .eq("id", messageId);
      return json({ error: "audio_too_large", maxBytes: MAX_AUDIO_BYTES }, 413);
    }
    // Convert to base64 in chunks to avoid stack overflow
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);
    const format = mimetypeToFormat(message.media_mimetype);

    async function callAi(model: string) {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Transcreva fielmente este áudio em português brasileiro. Retorne APENAS o texto transcrito, sem comentários, aspas ou prefixos. Se o áudio estiver vazio ou inaudível, retorne exatamente: [áudio inaudível]",
                },
                {
                  type: "input_audio",
                  input_audio: { data: base64, format },
                },
              ],
            },
          ],
        }),
      });
    }

    // Use flash as primary (cheaper, fast enough for WhatsApp audio).
    // Pro is kept only as fallback if flash returns empty transcription.
    let aiRes = await callAi("google/gemini-2.5-flash");

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("[transcribe-audio] AI gateway error", aiRes.status, errText.slice(0, 400));
      await supabase
        .from("whatsapp_messages")
        .update({ transcription_status: "failed" })
        .eq("id", messageId);
      // Detect workspace credit limit (Lovable AI returns 403 with this `type`).
      // Surface as 402 so the UI shows a billing-specific message and does not retry.
      if (errText.includes("credit_limit_reached") || errText.includes("credits_exhausted")) {
        return json({
          error: "credits_exhausted",
          message: "Créditos de IA esgotados. Peça ao admin do workspace para aumentar o limite ou aguarde a renovação.",
        }, 402);
      }
      if (aiRes.status === 429) return json({ error: "rate_limited" }, 429);
      if (aiRes.status === 402) return json({ error: "credits_exhausted" }, 402);
      return json({ error: `ai error (${aiRes.status})` }, 502);
    }

    const aiJson = await aiRes.json();
    const rawContent = aiJson?.choices?.[0]?.message?.content;
    let transcription = "";
    if (typeof rawContent === "string") {
      transcription = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      transcription = rawContent
        .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
        .join("")
        .trim();
    }

    if (!transcription) {
      console.error("[transcribe-audio] empty transcription from AI", JSON.stringify(aiJson).slice(0, 400));
      // Fallback to Pro (more accurate, more expensive) when flash returns empty.
      const retryRes = await callAi("google/gemini-2.5-pro");
      if (retryRes.ok) {
        const retryJson = await retryRes.json();
        const rc = retryJson?.choices?.[0]?.message?.content;
        if (typeof rc === "string") transcription = rc.trim();
        else if (Array.isArray(rc)) {
          transcription = rc
            .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
            .join("")
            .trim();
        }
        if (!transcription) {
          console.error("[transcribe-audio] empty after retry", JSON.stringify(retryJson).slice(0, 400));
        }
      }
      if (!transcription) {
        await supabase
          .from("whatsapp_messages")
          .update({ transcription_status: "failed" })
          .eq("id", messageId);
        return json({ error: "empty transcription" }, 502);
      }
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