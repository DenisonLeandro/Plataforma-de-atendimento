import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SyncJob {
  id: string;
  instance_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  chats_synced: number;
  messages_synced: number;
  contacts_synced: number;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface StartSyncResponse {
  success: boolean;
  job_id?: string;
  status?: string;
  reused?: boolean;
  restarted?: boolean;
  error?: string;
}

export const useSyncWhatsAppHistory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instance_id: string): Promise<StartSyncResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-whatsapp-history`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ instance_id }),
      });
      const text = await res.text();
      let parsed: StartSyncResponse;
      try {
        parsed = JSON.parse(text) as StartSyncResponse;
      } catch {
        throw new Error(`Resposta inválida (${res.status}): ${text.slice(0, 200)}`);
      }
      if (!parsed.success) {
        throw new Error(parsed.error || 'Falha ao iniciar sincronização');
      }
      return parsed;
    },
    onSuccess: (_data, instance_id) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp_sync_job', instance_id] });
    },
  });
};

/**
 * Watch the latest sync job for an instance. Combines a 3s poll fallback
 * with realtime updates so the UI reflects background progress even if the
 * tab was just opened.
 */
export const useSyncJob = (instance_id: string | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['whatsapp_sync_job', instance_id],
    enabled: !!instance_id,
    refetchInterval: (q) => {
      const data = q.state.data as SyncJob | null | undefined;
      return data?.status === 'running' ? 3000 : false;
    },
    queryFn: async (): Promise<SyncJob | null> => {
      const { data, error } = await supabase
        .from('whatsapp_sync_jobs')
        .select('id, instance_id, status, chats_synced, messages_synced, contacts_synced, error_message, started_at, updated_at, finished_at')
        .eq('instance_id', instance_id!)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as SyncJob | null) ?? null;
    },
  });

  // Realtime subscription for live progress.
  useEffect(() => {
    if (!instance_id) return;
    const channel = supabase
      .channel(`sync_jobs_${instance_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sync_jobs', filter: `instance_id=eq.${instance_id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as SyncJob | undefined;
          if (!row) return;
          queryClient.setQueryData(['whatsapp_sync_job', instance_id], row);
          if (row.status === 'completed' || row.status === 'failed') {
            queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [instance_id, queryClient]);

  useEffect(() => {
    if (query.data?.status === 'completed' || query.data?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    }
  }, [query.data?.status, queryClient]);

  return query;
};

/**
 * Helper that fires a one-time toast when the most recent sync job
 * transitions from running → completed/failed.
 */
export const useSyncJobCompletion = (
  instance_id: string | undefined,
  onComplete: (job: SyncJob) => void,
) => {
  const { data: job } = useSyncJob(instance_id);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  useEffect(() => {
    if (!job) return;
    if (job.status !== 'completed' && job.status !== 'failed') return;
    const key = `${job.id}:${job.status}`;
    if (lastSeen === key) return;
    setLastSeen(key);
    onComplete(job);
  }, [job, lastSeen, onComplete]);
  return job;
};