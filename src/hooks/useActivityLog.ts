import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ActivityLogRow {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  company_id: string | null;
  company_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface UseActivityLogParams {
  /** null = todas as empresas visíveis (super_admin). Admin é auto-escopado pela RPC. */
  companyIds?: string[] | null;
  actorUserId?: string | null;
  actions?: string[] | null;
  startDate: Date;
  endDate: Date;
  limit?: number;
  enabled?: boolean;
}

/**
 * Lê o log de auditoria via RPC get_activity_logs (que já aplica a permissão:
 * super_admin vê tudo, admin vê a própria empresa). Atualiza ao vivo: refetch a
 * cada 60s + INSERT em activity_logs via Realtime.
 */
export function useActivityLog({
  companyIds = null,
  actorUserId = null,
  actions = null,
  startDate,
  endDate,
  limit = 200,
  enabled = true,
}: UseActivityLogParams) {
  const queryClient = useQueryClient();

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const companyKey = companyIds ? [...companyIds].sort().join(',') : 'all';
  const actionsKey = actions ? [...actions].sort().join(',') : 'all';

  const queryKey = ['activity-logs', companyKey, actorUserId ?? 'all', actionsKey, startIso, endIso, limit];

  const query = useQuery<ActivityLogRow[]>({
    queryKey,
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_activity_logs', {
        _company_ids: companyIds && companyIds.length > 0 ? companyIds : null,
        _actor_user_id: actorUserId || null,
        _actions: actions && actions.length > 0 ? actions : null,
        _start_date: startIso,
        _end_date: endIso,
        _limit: limit,
      });

      if (error) throw error;

      return ((data as any[]) || []).map((row) => ({
        id: row.id,
        actor_user_id: row.actor_user_id,
        actor_name: row.actor_name,
        actor_role: row.actor_role,
        company_id: row.company_id,
        company_name: row.company_name,
        action: row.action,
        target_type: row.target_type,
        target_id: row.target_id,
        target_label: row.target_label,
        metadata: row.metadata,
        created_at: row.created_at,
      }));
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('activity-logs-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['activity-logs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, enabled]);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
