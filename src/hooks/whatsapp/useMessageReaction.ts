import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SendReactionParams {
  messageId: string;
  conversationId: string;
  emoji: string;
  reactorJid: string;
  isFromMe: boolean;
}

export const useMessageReaction = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sendReaction = useMutation({
    mutationFn: async ({ messageId, conversationId, emoji }: SendReactionParams) => {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-reaction', {
        body: { messageId, conversationId, emoji },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Falha ao enviar reação');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'reactions', variables.conversationId] 
      });
    },
    onError: (error) => {
      console.error('Error sending reaction:', error);
      toast({
        title: "Erro ao reagir",
        description: "Não foi possível enviar a reação. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  return { sendReaction };
};
