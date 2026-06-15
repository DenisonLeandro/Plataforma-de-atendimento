import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SyncDiagnostic {
  step: string;
  url: string;
  status: number;
  content_type: string;
  raw_sample: string;
  parsed_count: number;
}

export interface SyncHistoryResult {
  success: boolean;
  continued?: boolean;
  next_cursor?: Record<string, unknown>;
  started?: boolean;
  message?: string;
  chats_synced?: number;
  messages_synced?: number;
  contacts_synced?: number;
  diagnostics?: SyncDiagnostic[];
  errors?: { chat?: string; error: string }[];
  error?: string;
}

export const useSyncWhatsAppHistory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instance_id: string): Promise<SyncHistoryResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-whatsapp-history`;
      const startedAt = Date.now();
      const maxTotalMs = 5 * 60 * 1000;
      const aggregate: SyncHistoryResult = {
        success: true,
        chats_synced: 0,
        messages_synced: 0,
        contacts_synced: 0,
        diagnostics: [],
        errors: [],
      };

      const callChunk = async (cursor?: Record<string, unknown>): Promise<SyncHistoryResult> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(cursor ? { instance_id, cursor } : { instance_id }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const text = await res.text();
        let result: SyncHistoryResult;
        try {
          result = JSON.parse(text) as SyncHistoryResult;
        } catch {
          throw new Error(`Resposta inválida (${res.status}): ${text.slice(0, 200)}`);
        }
        if (!result?.success) {
          const err: any = new Error(result?.error || 'Falha ao sincronizar histórico');
          err.result = result;
          throw err;
        }
        return result;
      };

      let cursor: Record<string, unknown> | undefined;
      for (let chunk = 0; chunk < 100 && Date.now() - startedAt < maxTotalMs; chunk++) {
        const result = await callChunk(cursor);
        aggregate.chats_synced = (aggregate.chats_synced ?? 0) + (result.chats_synced ?? 0);
        aggregate.messages_synced = (aggregate.messages_synced ?? 0) + (result.messages_synced ?? 0);
        aggregate.contacts_synced = (aggregate.contacts_synced ?? 0) + (result.contacts_synced ?? 0);
        aggregate.diagnostics = [...(aggregate.diagnostics ?? []), ...(result.diagnostics ?? [])].slice(-50);
        aggregate.errors = [...(aggregate.errors ?? []), ...(result.errors ?? [])];
        aggregate.next_cursor = result.next_cursor;
        aggregate.continued = result.continued;

        if (!result.continued || !result.next_cursor) {
          aggregate.continued = false;
          return aggregate;
        }

        cursor = result.next_cursor;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      aggregate.continued = true;
      aggregate.message = 'Sincronização pausada pelo limite de tempo do navegador. Execute novamente para continuar.';
      return aggregate;
    },
    onSuccess: (data) => {
      console.log('[sync-whatsapp-history] result', data);
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });
};