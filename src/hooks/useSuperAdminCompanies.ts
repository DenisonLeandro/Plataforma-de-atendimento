import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SuperAdminCompany {
  id: string;
  name: string;
  status: 'active' | 'suspended';
}

/**
 * Lista simples de empresas (id, name, status) para telas de super_admin que
 * não precisam das contagens enriquecidas (usuários/instâncias) da SuperAdminPage.
 * super_admin vê todas via RLS de companies.
 */
export function useSuperAdminCompanies(enabled = true) {
  const query = useQuery<SuperAdminCompany[]>({
    queryKey: ['super-admin', 'companies-simple'],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('companies' as any)
        .select('id, name, status')
        .order('created_at', { ascending: true }) as any);

      if (error) throw error;

      return ((data as any[]) || []).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
      }));
    },
  });

  return {
    companies: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
