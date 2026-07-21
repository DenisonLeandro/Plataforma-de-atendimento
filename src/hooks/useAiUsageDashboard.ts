import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AiFeature =
  | 'transcription'
  | 'sentiment'
  | 'categorization'
  | 'summary'
  | 'smart_replies'
  | 'composer';

export interface AiUsageSummaryRow {
  company_id: string;
  company_name: string;
  feature: AiFeature;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_brl: number;
}

interface UseAiUsageDashboardParams {
  /** null = todas as empresas visíveis para o usuário */
  companyIds: string[] | null;
  startDate: Date;
  endDate: Date;
  /** false = não consulta nem assina Realtime (usado para não-super_admin) */
  enabled?: boolean;
}

/**
 * Agrega custos de IA por empresa/feature via RPC `get_ai_usage_summary`.
 * A RPC já filtra por permissão (super_admin vê tudo, admin vê a própria empresa).
 *
 * Atualização automática: refetch a cada 60s + refetch imediato quando chega um
 * INSERT em ai_usage_logs via Realtime.
 */
export function useAiUsageDashboard({
  companyIds,
  startDate,
  endDate,
  enabled = true,
}: UseAiUsageDashboardParams) {
  const queryClient = useQueryClient();

  // Chaves estáveis: Date objects novos a cada render invalidariam o cache sempre.
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const companyKey = companyIds ? [...companyIds].sort().join(',') : 'all';

  const queryKey = ['ai-usage-summary', companyKey, startIso, endIso];

  const query = useQuery<AiUsageSummaryRow[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_ai_usage_summary', {
        _company_ids: companyIds && companyIds.length > 0 ? companyIds : null,
        _start_date: startIso,
        _end_date: endIso,
      });

      if (error) throw error;

      return ((data as any[]) || []).map((row) => ({
        company_id: row.company_id,
        company_name: row.company_name,
        feature: row.feature as AiFeature,
        total_calls: Number(row.total_calls) || 0,
        total_input_tokens: Number(row.total_input_tokens) || 0,
        total_output_tokens: Number(row.total_output_tokens) || 0,
        total_cost_usd: Number(row.total_cost_usd) || 0,
        total_cost_brl: Number(row.total_cost_brl) || 0,
      }));
    },
    enabled,
    refetchInterval: 60_000,
  });

  // Realtime: novo log de IA -> refetch imediato
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('ai-usage-logs-dashboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_usage_logs' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['ai-usage-summary'] });
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
