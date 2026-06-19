import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recoverMessageMedia } from "../_shared/media-recovery.ts";

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

// Wrapper fino: a lógica de recuperação vive em `_shared/media-recovery.ts` (reusada
// pelo backfill). Aqui só validamos a entrada e traduzimos o RecoverResult para o
// mesmo JSON/HTTP que o frontend já consome (sem mudança visível).
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

    const result = await recoverMessageMedia(supabase, messageId, { timeoutMs: 20000 });

    switch (result.status) {
      case "success":
        return json({
          success: true,
          media_url: result.media_url,
          media_mimetype: result.media_mimetype,
        });
      case "unavailable":
        // Soft-failure: media gone from WhatsApp — 200 so the client doesn't blow up/retry.
        return json({ success: false, unavailable: true, error: result.error });
      case "not_media":
        return json({ error: result.error }, 400);
      case "failed":
        return json({ error: result.error }, result.httpStatus);
      default:
        console.error("[fetch-message-media] unexpected recover status", result);
        return json({ error: "unexpected internal status" }, 500);
    }
  } catch (err) {
    console.error("[fetch-message-media] unexpected error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
