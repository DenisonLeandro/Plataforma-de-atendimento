import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformFixedCost {
  id: string;
  label: string;
  amount_brl: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['platform-fixed-costs'];

/**
 * Custos fixos mensais da plataforma (platform_fixed_costs).
 * Exclusivo do super_admin — a RLS retorna zero linhas para outros papéis.
 * Realtime: qualquer INSERT/UPDATE/DELETE invalida a query.
 */
export function usePlatformFixedCosts(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery<PlatformFixedCost[]>({
    queryKey: QUERY_KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('platform_fixed_costs' as any)
        .select('*')
        .order('created_at', { ascending: true }) as any);

      if (error) throw error;

      return ((data as any[]) || []).map((row) => ({
        id: row.id,
        label: row.label,
        amount_brl: Number(row.amount_brl) || 0,
        active: !!row.active,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    },
  });

  // Realtime: mudanças nos custos fixos -> refetch
  useEffect(() => {
    if (!enabled) return;

    const channelName = `platform-fixed-costs:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_fixed_costs' },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, enabled]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  // Mutations diretas (escrita protegida pela RLS: só super_admin).
  const addCost = async (label: string, amount_brl: number) => {
    const { error } = await (supabase
      .from('platform_fixed_costs' as any)
      .insert({ label, amount_brl }) as any);
    if (error) throw error;
    await invalidate();
  };

  const updateCost = async (
    id: string,
    patch: Partial<Pick<PlatformFixedCost, 'label' | 'amount_brl' | 'active'>>
  ) => {
    const { error } = await (supabase
      .from('platform_fixed_costs' as any)
      .update(patch)
      .eq('id', id) as any);
    if (error) throw error;
    await invalidate();
  };

  const deleteCost = async (id: string) => {
    const { error } = await (supabase
      .from('platform_fixed_costs' as any)
      .delete()
      .eq('id', id) as any);
    if (error) throw error;
    await invalidate();
  };

  return {
    costs: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addCost,
    updateCost,
    deleteCost,
  };
}
