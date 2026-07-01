import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useCompanyContext } from '@/hooks/useCompanyContext';

type Conversation = Tables<'whatsapp_conversations'>;
type Contact = Tables<'whatsapp_contacts'>;

interface ConversationWithContact extends Conversation {
  contact: Contact;
  isLastMessageFromMe?: boolean;
  instance?: { instance_name: string; name: string } | null;
}

interface ConversationsFilters {
  instanceId?: string;
  search?: string;
  status?: string;
  statusIn?: string[];
  assignedTo?: string;
  unassigned?: boolean;
  unreadOnly?: boolean;
  waitingOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ConversationsResult {
  conversations: ConversationWithContact[];
  totalCount: number;
  totalPages: number;
  unreadCount: number;
  waitingCount: number;
}

export const useWhatsAppConversations = (filters?: ConversationsFilters) => {
  const queryClient = useQueryClient();
  const { companyId } = useCompanyContext();
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'conversations', filters, companyId],
    queryFn: async () => {
      if (!companyId) {
        return {
          conversations: [],
          totalCount: 0,
          totalPages: 0,
          unreadCount: 0,
          waitingCount: 0,
        };
      }
      // Quando há termo de busca, primeiro descobrimos quais contact_ids casam
      // por nome ou telefone, para filtrar conversas globalmente (não só na página).
      let searchContactIds: string[] | null = null;
      const searchTerm = filters?.search?.trim();
      if (searchTerm) {
        const escaped = searchTerm.replace(/[%,]/g, ' ');
        const { data: matchingContacts } = await supabase
          .from('whatsapp_contacts')
          .select('id')
          .eq('company_id', companyId)
          .or(`name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%`)
          .limit(500);
        searchContactIds = (matchingContacts || []).map((c: { id: string }) => c.id);
      }

      const applySearch = <T extends { or: (f: string) => T; in: (col: string, vals: string[]) => T }>(q: T): T => {
        if (!searchTerm) return q;
        const escaped = searchTerm.replace(/[%,]/g, ' ');
        if (searchContactIds && searchContactIds.length > 0) {
          // match em contact_id OU em last_message_preview
          const idsCsv = searchContactIds.join(',');
          return q.or(`contact_id.in.(${idsCsv}),last_message_preview.ilike.%${escaped}%`);
        }
        // Sem contatos casando: filtra só por preview
        return q.or(`last_message_preview.ilike.%${escaped}%`);
      };

      // Query 1: Get paginated conversations
      let query = supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          contact:whatsapp_contacts(*),
          assigned_profile:profiles(id, full_name, display_name, avatar_url),
          instance:whatsapp_instances(instance_name, name)
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .range(from, to);

      if (filters?.instanceId) {
        query = query.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.statusIn && filters.statusIn.length > 0) {
        query = query.in('status', filters.statusIn);
      }

      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        query = query.is('assigned_to', null);
      }

      if (filters?.unreadOnly) {
        query = query
          .gt('unread_count', 0)
          .not('status', 'in', '("closed","archived")');
      }

      if (filters?.waitingOnly) {
        query = query
          .eq('last_message_is_from_me', false)
          .not('status', 'in', '("closed","archived")');
      }

      query = applySearch(query as any) as typeof query;

      const { data: conversationsData, error, count: listCount } = await query;

      if (error) {
        console.error('[useWhatsAppConversations] query error:', error);
        throw error;
      }

      let result = conversationsData as unknown as ConversationWithContact[];

      // Usa a coluna persistida em vez de varrer todas as mensagens.
      result = result.map(conv => ({
        ...conv,
        isLastMessageFromMe: conv.last_message_is_from_me ?? undefined,
      }));

      // Conversas transferidas de instâncias às quais o usuário não tem acesso
      // direto vêm com `instance` nulo (o embed é bloqueado pela RLS de
      // whatsapp_instances). Buscamos o nome da instância de origem via RPC
      // (SECURITY DEFINER) só para esses casos, para exibir de onde a conversa é.
      const missingInstanceIds = Array.from(
        new Set(
          result
            .filter((c) => !c.instance && (c as any).instance_id)
            .map((c) => (c as any).instance_id as string)
        )
      );

      if (missingInstanceIds.length > 0) {
        const { data: instNames } = await (supabase.rpc as any)('get_instance_names', {
          _ids: missingInstanceIds,
        });
        const nameMap = new Map<string, { name: string | null; instance_name: string | null }>(
          (instNames || []).map((r: any) => [r.id as string, { name: r.name, instance_name: r.instance_name }])
        );
        result = result.map((c) => {
          const iid = (c as any).instance_id as string | undefined;
          if (!c.instance && iid && nameMap.has(iid)) {
            const r = nameMap.get(iid)!;
            return { ...c, instance: { instance_name: r.instance_name ?? '', name: r.name ?? '' } };
          }
          return c;
        });
      }

      // Contadores consolidados em uma única RPC (não lidas + aguardando + total),
      // pulamos quando há busca textual (a RPC não filtra por search).
      let unreadCount = 0;
      let waitingCount = 0;
      let totalCount = listCount ?? 0;

      if (!searchTerm) {
        const { data: counters } = await supabase.rpc('get_conversation_counters', {
          _instance_id: filters?.instanceId ?? null,
          _status: filters?.status ?? null,
          _status_in: filters?.statusIn && filters.statusIn.length > 0 ? filters.statusIn : null,
          _assigned_to: filters?.assignedTo ?? null,
          _unassigned: filters?.unassigned ?? false,
        });
        const row = Array.isArray(counters) ? counters[0] : counters;
        if (row) {
          unreadCount = Number(row.unread_count) ?? 0;
          waitingCount = Number(row.waiting_count) ?? 0;
          // A RPC não conhece unreadOnly/waitingOnly; nesses casos listCount (exact) já é correto.
          if (!filters?.unreadOnly && !filters?.waitingOnly) {
            totalCount = row.total_count != null ? Number(row.total_count) : totalCount;
          }
        }
      }

      const totalPages = Math.ceil((totalCount || 0) / pageSize);

      return {
        conversations: result,
        totalCount: totalCount || 0,
        totalPages,
        unreadCount: unreadCount || 0,
        waitingCount: waitingCount || 0,
      } as ConversationsResult;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !!companyId,
  });

  useEffect(() => {
    // Debounce invalidations: durante um sync que insere milhares de mensagens,
    // agrupamos os eventos em janelas para não disparar 1 refetch por linha.
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (timeout) return;
      timeout = setTimeout(() => {
        timeout = null;
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      }, 3000);
    };

    // Filtrar a subscription por instância quando aplicável, para não receber
    // eventos de instâncias que esta tela nem está exibindo.
    const instanceFilter = filters?.instanceId
      ? `instance_id=eq.${filters.instanceId}`
      : undefined;

    const channel = supabase
      .channel(`conversations-changes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
        ...(instanceFilter ? { filter: instanceFilter } : {}),
      }, scheduleInvalidate)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
      }, scheduleInvalidate)
      .subscribe();

    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [queryClient, filters?.instanceId]);

  return {
    conversations: data?.conversations || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 0,
    unreadCount: data?.unreadCount || 0,
    waitingCount: data?.waitingCount || 0,
    isLoading,
    error,
  };
};
