import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Agent } from './useAgents';

interface AssignableAgentRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  role: string;
  active_conversations: number;
}

/**
 * Lista os atendentes que podem receber uma conversa de uma instância.
 * Usa a RPC SECURITY DEFINER `get_assignable_agents`, que enxerga todos os
 * atendentes válidos (independente da RLS restritiva de profiles/user_roles)
 * e já restringe pelo acesso à instância (can_user_see_instance).
 */
export const useAssignableAgents = (instanceId?: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['assignable-agents', instanceId],
    enabled: !!instanceId,
    queryFn: async (): Promise<Agent[]> => {
      const { data, error } = await supabase.rpc('get_assignable_agents', {
        _instance_id: instanceId,
      });
      if (error) throw error;

      return (data as AssignableAgentRow[]).map((row) => ({
        id: row.id,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
        status: row.status as Agent['status'],
        role: row.role as Agent['role'],
        activeConversations: row.active_conversations ?? 0,
      }));
    },
  });

  return {
    agents: data || [],
    isLoading,
    error,
  };
};
