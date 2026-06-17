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

async function callEvolution(
  apiUrl: string,
  apiKey: string,
  providerType: string,
  path: string,
  body: unknown,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (providerType === "cloud") headers["Authorization"] = `Bearer ${apiKey}`;
  else headers["apikey"] = apiKey;

  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { ok: res.ok, status: res.status, parsed, raw: text };
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

    // 1. Load the message
    const { data: message, error: msgError } = await supabase
      .from("whatsapp_messages")
      .select(
        "id, message_id, remote_jid, is_from_me, message_type, media_mimetype, conversation_id",
      )
      .eq("id", messageId)
      .single();

    if (msgError || !message) {
      console.error("[fetch-message-media] message not found", msgError);
      return json({ error: "message not found" }, 404);
    }

    if (message.message_type === "text") {
      return json({ error: "message has no media" }, 400);
    }

    // 2. Resolve instance via conversation
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("instance_id")
      .eq("id", message.conversation_id)
      .single();

    if (!conversation) return json({ error: "conversation not found" }, 404);

    const { data: instanceData } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, instance_id_external, provider_type")
      .eq("id", conversation.instance_id)
      .single();

    if (!instanceData) return json({ error: "instance not found" }, 404);

    const { data: secrets } = await supabase
      .from("whatsapp_instance_secrets")
      .select("api_url, api_key")
      .eq("instance_id", instanceData.id)
      .single();

    if (!secrets) return json({ error: "instance secrets not found" }, 404);

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
        "[fetch-message-media] message payload not returned by Evolution",
        lastStatus,
        lastRaw.slice(0, 200),
      );
      // Return 200 with a soft-failure flag so the client doesn't blow up with a 502/404
      // and doesn't keep retrying. WhatsApp likely purged the media from the server.
      return json({
        success: false,
        unavailable: true,
        error: "Mídia não está mais disponível no WhatsApp",
      });
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
    );

    if (!mediaRes.ok || !mediaRes.parsed?.base64) {
      console.error("[fetch-message-media] getBase64 failed", mediaRes.status, mediaRes.raw.slice(0, 300));
      return json({ error: `media download failed (${mediaRes.status})` }, 502);
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

    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(filePath, blob, { contentType: mimetype, upsert: true });

    if (uploadError) {
      console.error("[fetch-message-media] upload failed", uploadError);
      return json({ error: "storage upload failed" }, 500);
    }

    const { data: publicUrlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(filePath);

    const mediaUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({ media_url: mediaUrl, media_mimetype: mimetype })
      .eq("id", message.id);

    if (updateError) {
      console.error("[fetch-message-media] db update failed", updateError);
      return json({ error: "failed to persist media url" }, 500);
    }

    return json({ success: true, media_url: mediaUrl, media_mimetype: mimetype });
  } catch (err) {
    console.error("[fetch-message-media] unexpected error", err);
    return json({ error: (err as Error).message }, 500);
  }
});