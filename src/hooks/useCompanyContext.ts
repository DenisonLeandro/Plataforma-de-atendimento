import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Company {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'suspended';
  created_at: string;
}

export interface CompanyContext {
  company: Company | null;
  companyId: string | null;
  companyName: string | null;
  isSuperAdmin: boolean;
  isLoading: boolean;
}

export function useCompanyContext(): CompanyContext {
  const { user, isSuperAdmin, viewingAsCompanyId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['company-context', user?.id, viewingAsCompanyId],
    queryFn: async (): Promise<Company | null> => {
      let companyId = viewingAsCompanyId;

      if (!companyId) {
        const { data: userCompanyId, error } = await (supabase.rpc as any)('get_user_company_id');
        if (error || !userCompanyId) return null;
        companyId = userCompanyId;
      }

      const { data: company } = await (supabase.from as any)('companies')
        .select('id, name, code, status, created_at')
        .eq('id', companyId)
        .single();

      return (company as Company) ?? null;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    company: data ?? null,
    companyId: data?.id ?? null,
    companyName: data?.name ?? null,
    isSuperAdmin,
    isLoading,
  };
}
