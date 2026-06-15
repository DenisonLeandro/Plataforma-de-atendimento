import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SyncHistoryResult {
  success: boolean;
  started?: boolean;
  message?: string;
  chats_synced?: number;
  messages_synced?: number;
  contacts_synced?: number;
  errors?: { chat?: string; error: string }[];
  error?: string;
}

export const useSyncWhatsAppHistory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instance_id: string): Promise<SyncHistoryResult> => {
      const { data, error } = await supabase.functions.invoke('sync-whatsapp-history', {
        body: { instance_id },
      });
      if (error) throw error;
      const result = data as SyncHistoryResult;
      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao sincronizar histórico');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });
};