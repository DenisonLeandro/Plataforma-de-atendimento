import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type Conversation = Tables<'whatsapp_conversations'>;
type Contact = Tables<'whatsapp_contacts'>;

interface ConversationWithContact extends Conversation {
  contact: Contact;
  isLastMessageFromMe?: boolean;
  instance?: { instance_name: string } | null;
}

interface ConversationsFilters {
  instanceId?: string;
  search?: string;
  status?: string;
  statusIn?: string[];
  assignedTo?: string;
  unassigned?: boolean;
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
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'conversations', filters],
    queryFn: async () => {
      // Quando há termo de busca, primeiro descobrimos quais contact_ids casam
      // por nome ou telefone, para filtrar conversas globalmente (não só na página).
      let searchContactIds: string[] | null = null;
      const searchTerm = filters?.search?.trim();
      if (searchTerm) {
        const escaped = searchTerm.replace(/[%,]/g, ' ');
        const { data: matchingContacts } = await supabase
          .from('whatsapp_contacts')
          .select('id')
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
          assigned_profile:profiles(id, full_name, avatar_url),
          instance:whatsapp_instances(instance_name)
        `)
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

      query = applySearch(query as any) as typeof query;

      const { data: conversationsData, error } = await query;

      if (error) {
        console.error('[useWhatsAppConversations] query error:', error);
        throw error;
      }

      let result = conversationsData as unknown as ConversationWithContact[];

      // Query 2: Get total count (without pagination)
      let countQuery = supabase
        .from('whatsapp_conversations')
        .select('*', { count: 'exact', head: true });

      if (filters?.instanceId) {
        countQuery = countQuery.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        countQuery = countQuery.eq('status', filters.status);
      }

      if (filters?.statusIn && filters.statusIn.length > 0) {
        countQuery = countQuery.in('status', filters.statusIn);
      }

      if (filters?.assignedTo) {
        countQuery = countQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        countQuery = countQuery.is('assigned_to', null);
      }

      countQuery = applySearch(countQuery as any) as typeof countQuery;

      const { count: totalCount } = await countQuery;

      // Query 3: Get unread count (all conversations)
      let unreadQuery = supabase
        .from('whatsapp_conversations')
        .select('unread_count', { count: 'exact' })
        .gt('unread_count', 0);

      if (filters?.instanceId) {
        unreadQuery = unreadQuery.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        unreadQuery = unreadQuery.eq('status', filters.status);
      }

      if (filters?.statusIn && filters.statusIn.length > 0) {
        unreadQuery = unreadQuery.in('status', filters.statusIn);
      }

      if (filters?.assignedTo) {
        unreadQuery = unreadQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        unreadQuery = unreadQuery.is('assigned_to', null);
      }

      const { count: unreadCount } = await unreadQuery;

      // Usa a coluna persistida em vez de varrer todas as mensagens.
      result = result.map(conv => ({
        ...conv,
        isLastMessageFromMe: conv.last_message_is_from_me ?? undefined,
      }));

      // waitingCount: conversas onde a última mensagem é do cliente.
      let waitingQuery = supabase
        .from('whatsapp_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('last_message_is_from_me', false);

      if (filters?.instanceId) waitingQuery = waitingQuery.eq('instance_id', filters.instanceId);
      if (filters?.status) waitingQuery = waitingQuery.eq('status', filters.status);
      if (filters?.statusIn && filters.statusIn.length > 0) waitingQuery = waitingQuery.in('status', filters.statusIn);
      if (filters?.assignedTo) waitingQuery = waitingQuery.eq('assigned_to', filters.assignedTo);
      if (filters?.unassigned) waitingQuery = waitingQuery.is('assigned_to', null);

      const { count: waitingCount } = await waitingQuery;

      const totalPages = Math.ceil((totalCount || 0) / pageSize);

      return {
        conversations: result,
        totalCount: totalCount || 0,
        totalPages,
        unreadCount: unreadCount || 0,
        waitingCount: waitingCount || 0,
      } as ConversationsResult;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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
      }, 1500);
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
