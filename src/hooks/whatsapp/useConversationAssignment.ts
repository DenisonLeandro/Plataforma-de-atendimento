import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AssignmentHistory {
  id: string;
  conversation_id: string;
  assigned_from: string | null;
  assigned_to: string;
  assigned_by: string | null;
  reason: string | null;
  created_at: string;
}

export const useConversationAssignment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const assignConversation = useMutation({
    mutationFn: async ({
      conversationId,
      assignedTo,
      reason
    }: {
      conversationId: string;
      assignedTo: string;
      reason?: string;
    }) => {
      // RPC SECURITY DEFINER: valida acesso, faz o UPDATE e registra o histórico no servidor.
      const { error } = await supabase.rpc('assign_conversation', {
        _conversation_id: conversationId,
        _assigned_to: assignedTo,
        _reason: reason || null,
      });
      if (error) throw error;

      return { conversationId, assignedTo };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      toast({
        title: "Conversa atribuída",
        description: "A conversa foi atribuída com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error assigning conversation:', error);
      toast({
        title: "Erro ao atribuir",
        description: "Não foi possível atribuir a conversa.",
        variant: "destructive",
      });
    },
  });

  const transferConversation = useMutation({
    mutationFn: async ({
      conversationId,
      newAssignee,
      reason
    }: {
      conversationId: string;
      newAssignee: string;
      reason?: string;
    }) => {
      const { error } = await supabase.rpc('assign_conversation', {
        _conversation_id: conversationId,
        _assigned_to: newAssignee,
        _reason: reason || null,
      });
      if (error) throw error;

      return { conversationId, newAssignee };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      toast({
        title: "Conversa transferida",
        description: "A conversa foi transferida com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error transferring conversation:', error);
      toast({
        title: "Erro ao transferir",
        description: "Não foi possível transferir a conversa.",
        variant: "destructive",
      });
    },
  });

  const unassignConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('assign_conversation', {
        _conversation_id: conversationId,
        _assigned_to: null,
        _reason: 'Devolvido para a fila',
      });
      if (error) throw error;

      return conversationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      toast({
        title: "Conversa devolvida",
        description: "A conversa foi devolvida para a fila.",
      });
    },
    onError: (error) => {
      console.error('Error unassigning conversation:', error);
      toast({
        title: "Erro ao devolver",
        description: "Não foi possível devolver a conversa.",
        variant: "destructive",
      });
    },
  });

  const getAssignmentHistory = (conversationId: string) => {
    return useQuery({
      queryKey: ['conversation-assignments', conversationId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('conversation_assignments')
          .select(`
            *,
            assigned_from_profile:profiles!conversation_assignments_assigned_from_fkey(full_name, avatar_url),
            assigned_to_profile:profiles!conversation_assignments_assigned_to_fkey(full_name, avatar_url),
            assigned_by_profile:profiles!conversation_assignments_assigned_by_fkey(full_name, avatar_url)
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data as AssignmentHistory[];
      },
      enabled: !!conversationId,
    });
  };

  return {
    assignConversation: assignConversation.mutate,
    transferConversation: transferConversation.mutate,
    unassignConversation: unassignConversation.mutate,
    getAssignmentHistory,
    isAssigning: assignConversation.isPending,
    isTransferring: transferConversation.isPending,
  };
};
