import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useWhatsAppActions = () => {
  const queryClient = useQueryClient();

  // Archive conversation
  const archiveMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'archived' })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'conversations'] });
      const previousConversations = queryClient.getQueryData(['whatsapp', 'conversations']);
      
      queryClient.setQueryData(['whatsapp', 'conversations'], (old: any) => {
        if (!old) return old;
        return old.map((conv: any) => 
          conv.id === conversationId ? { ...conv, status: 'archived' } : conv
        );
      });
      
      return { previousConversations };
    },
    onSuccess: () => {
      toast.success('Conversa arquivada com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error, _, context: any) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['whatsapp', 'conversations'], context.previousConversations);
      }
      console.error('Erro ao arquivar conversa:', error);
      toast.error('Erro ao arquivar conversa');
    },
  });

  // Close conversation
  const closeMutation = useMutation({
    mutationFn: async ({ conversationId, generateSummary }: { 
      conversationId: string; 
      generateSummary: boolean;
    }) => {
      if (generateSummary) {
        try {
          await supabase.functions.invoke('generate-conversation-summary', {
            body: { conversationId }
          });
        } catch (e) {
          console.error('Erro ao gerar resumo:', e);
        }
      }

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'closed' })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Conversa encerrada com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error) => {
      console.error('Erro ao encerrar conversa:', error);
      toast.error('Erro ao encerrar conversa');
    },
  });

  // Reopen conversation
  const reopenMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'active' })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Conversa reaberta com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error) => {
      console.error('Erro ao reabrir conversa:', error);
      toast.error('Erro ao reabrir conversa');
    },
  });

  // Mark as unread
  const markAsUnreadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 1 })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'conversations'] });
      const previousConversations = queryClient.getQueryData(['whatsapp', 'conversations']);
      
      queryClient.setQueryData(['whatsapp', 'conversations'], (old: any) => {
        if (!old) return old;
        return old.map((conv: any) => 
          conv.id === conversationId ? { ...conv, unread_count: 1 } : conv
        );
      });
      
      return { previousConversations };
    },
    onSuccess: () => {
      toast.success('Conversa marcada como não lida');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error, _, context: any) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['whatsapp', 'conversations'], context.previousConversations);
      }
      toast.error('Erro ao marcar conversa como não lida');
    },
  });

  // Update contact
  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: {
      contactId: string;
      data: { name: string; notes: string | null; phone_number?: string; markManualEdit?: boolean };
    }) => {
      const updates: Record<string, any> = {
        name: data.name,
        notes: data.notes,
        updated_at: new Date().toISOString(),
      };
      // Only update the phone when explicitly provided (manual correction of e.g. @lid numbers).
      if (data.phone_number !== undefined) {
        updates.phone_number = data.phone_number;
      }

      // When the user manually edits phone/name, lock the contact so the webhook never
      // overwrites it again, and preserve the original LID so the webhook can re-match it.
      if (data.markManualEdit) {
        const { data: current } = await supabase
          .from('whatsapp_contacts')
          .select('metadata, phone_number')
          .eq('id', contactId)
          .maybeSingle();
        const metadata = ((current?.metadata as Record<string, unknown>) || {});
        const merged: Record<string, unknown> = { ...metadata, manual_edit: true };
        if (!merged.lid && current?.phone_number && /^\d{14,}$/.test(current.phone_number)) {
          merged.lid = current.phone_number;
        }
        updates.metadata = merged;
      }

      const { error } = await supabase
        .from('whatsapp_contacts')
        .update(updates as any)
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contato atualizado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact-details'] });
    },
    onError: (error: unknown) => {
      console.error('Erro ao atualizar contato:', error);
      // Postgres unique_violation (instance_id, phone_number) → friendly message.
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        toast.error('Já existe um contato com esse número nesta instância');
      } else {
        toast.error('Erro ao atualizar contato');
      }
    },
  });

  return {
    archiveConversation: archiveMutation.mutate,
    isArchiving: archiveMutation.isPending,

    closeConversation: closeMutation.mutate,
    isClosing: closeMutation.isPending,

    reopenConversation: reopenMutation.mutate,
    isReopening: reopenMutation.isPending,

    markAsUnread: markAsUnreadMutation.mutate,
    isMarkingUnread: markAsUnreadMutation.isPending,

    updateContact: updateContactMutation.mutate,
    isUpdatingContact: updateContactMutation.isPending,
  };
};
