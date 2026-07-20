// Logging de custo das chamadas de IA -> public.ai_usage_logs.
// Fire-and-forget: nunca lança e nunca atrasa a resposta da feature.

export type AiFeature =
  | "transcription"
  | "sentiment"
  | "categorization"
  | "summary"
  | "smart_replies"
  | "composer";

const USD_BRL = 5.75;

/** Preço por 1K tokens (USD). Fallback = tabela do flash. */
function pricePer1K(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.includes("pro")) return { input: 0.00125, output: 0.01 };
  return { input: 0.00015, output: 0.0006 };
}

/**
 * Extrai tokens de uma resposta da Lovable AI Gateway.
 * A gateway pode devolver `usage` no formato OpenAI (prompt/completion) ou
 * Anthropic (input/output). Endpoints que não retornam usage (ex.:
 * /v1/audio/transcriptions) caem em 0/0 — o log é gravado mesmo assim.
 */
export function extractTokenUsage(aiJson: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  const usage = (aiJson as { usage?: Record<string, number> } | null)?.usage ?? {};
  return {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
  };
}

interface LogAiUsageParams {
  supabase: { from: (table: string) => { insert: (row: unknown) => PromiseLike<unknown> } };
  companyId: string | null | undefined;
  feature: AiFeature;
  model: string;
  aiJson?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  conversationId?: string | null;
  messageId?: string | null;
}

/**
 * Grava um log de uso de IA. Não aguardar o retorno — a promise já trata os
 * próprios erros. company_id é NOT NULL no banco, então sem empresa resolvida
 * o log é descartado (a feature nunca é bloqueada por causa disso).
 */
export function logAiUsage(params: LogAiUsageParams): void {
  const {
    supabase,
    companyId,
    feature,
    model,
    aiJson,
    conversationId = null,
    messageId = null,
  } = params;

  if (!companyId) {
    console.warn(`[ai-usage] sem company_id, log de '${feature}' descartado`);
    return;
  }

  const extracted = extractTokenUsage(aiJson);
  const inputTokens = params.inputTokens ?? extracted.inputTokens;
  const outputTokens = params.outputTokens ?? extracted.outputTokens;

  const price = pricePer1K(model);
  const costUsd =
    (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
  const costBrl = costUsd * USD_BRL;

  try {
    Promise.resolve(
      supabase.from("ai_usage_logs").insert({
        company_id: companyId,
        feature,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: costUsd,
        estimated_cost_brl: costBrl,
        conversation_id: conversationId,
        message_id: messageId,
      }),
    ).then(
      (res) => {
        const err = (res as { error?: unknown } | null)?.error;
        if (err) console.warn("[ai-usage] Falha ao logar:", err);
      },
      (err) => console.warn("[ai-usage] Falha ao logar:", err),
    );
  } catch (err) {
    console.warn("[ai-usage] Falha ao logar:", err);
  }
}

/** Resolve company_id a partir de uma conversa. Nunca lança. */
export async function companyIdFromConversation(
  supabase: any,
  conversationId: string | null | undefined,
): Promise<string | null> {
  if (!conversationId) return null;
  try {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("company_id")
      .eq("id", conversationId)
      .single();
    return data?.company_id ?? null;
  } catch (err) {
    console.warn("[ai-usage] Falha ao resolver company_id da conversa:", err);
    return null;
  }
}

/** Resolve company_id (e conversation_id) a partir de uma mensagem. Nunca lança. */
export async function companyIdFromMessage(
  supabase: any,
  messageId: string | null | undefined,
): Promise<{ companyId: string | null; conversationId: string | null }> {
  if (!messageId) return { companyId: null, conversationId: null };
  try {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("company_id, conversation_id")
      .eq("id", messageId)
      .single();
    return {
      companyId: data?.company_id ?? null,
      conversationId: data?.conversation_id ?? null,
    };
  } catch (err) {
    console.warn("[ai-usage] Falha ao resolver company_id da mensagem:", err);
    return { companyId: null, conversationId: null };
  }
}
