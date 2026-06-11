import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type Message = Tables<'whatsapp_messages'>;

export const useWhatsAppMessages = (conversationId: string | null) => {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
  });

  // Mark conversation as read when opened (also dismiss reopen banner if applicable)
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const { data: conv } = await supabase
        .from('whatsapp_conversations')
        .select('status, metadata')
        .eq('id', conversationId)
        .maybeSingle();
      const updates: any = { unread_count: 0 };
      if (conv?.status === 'reopened') {
        const meta: any = conv.metadata || {};
        updates.metadata = { ...meta, reopen_banner_dismissed: true };
      }
      await supabase.from('whatsapp_conversations').update(updates).eq('id', conversationId);
    })();
  }, [conversationId]);

  // Realtime subscription for new and edited messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
          const exists = old.some(msg => msg.id === payload.new.id);
          if (exists) return old;
          return [...old, payload.new as Message];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
          return old.map(msg => 
            msg.id === payload.new.id ? { ...msg, ...payload.new as Message } : msg
          );
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return {
    messages,
    isLoading,
    error,
  };
};
