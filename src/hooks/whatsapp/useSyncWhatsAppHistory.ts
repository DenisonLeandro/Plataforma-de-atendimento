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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ instance_id }),
          signal: controller.signal,
        });
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
      } finally {
        clearTimeout(timeoutId);
      }
    },
    onSuccess: (data) => {
      console.log('[sync-whatsapp-history] result', data);
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });
};