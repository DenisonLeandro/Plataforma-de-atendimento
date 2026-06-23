import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

type Message = Tables<'whatsapp_messages'>;

interface SendMessageParams {
  conversationId: string;
  content?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
  quotedMessageId?: string;
}

export const useWhatsAppSend = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (params: SendMessageParams) => {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: params,
      });

      if (error) {
        // A edge function pode devolver detalhes do erro no corpo da resposta
        // (FunctionsHttpError esconde isso atrás de uma mensagem genérica).
        let detail = error.message;
        try {
          const ctxBody = await (error as { context?: { json?: () => Promise<unknown> } })
            .context?.json?.();
          const bodyError = (ctxBody as { error?: string })?.error;
          if (bodyError) detail = bodyError;
        } catch {
          // mantém a mensagem genérica se não conseguir ler o corpo
        }
        throw new Error(detail);
      }

      // Defesa contra respostas 2xx que carregam um erro no corpo
      // (ex.: "Conversation not found", "Instance secrets not found").
      if (data && (data as { success?: boolean; error?: string }).success === false) {
        throw new Error((data as { error?: string }).error || 'Falha ao enviar mensagem');
      }

      return data;
    },
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'messages', newMessage.conversationId] });
      
      const previousMessages = queryClient.getQueryData(['whatsapp', 'messages', newMessage.conversationId]);

      const tempId = 'temp-' + Date.now();
      const optimisticMessage: Partial<Message> = {
        id: tempId,
        conversation_id: newMessage.conversationId,
        content: newMessage.content || '',
        message_type: newMessage.messageType,
        media_url: newMessage.mediaUrl,
        media_mimetype: newMessage.mediaMimetype,
        status: 'sending',
        is_from_me: true,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        message_id: '',
        remote_jid: '',
        quoted_message_id: newMessage.quotedMessageId || null,
        metadata: {},
      };

      queryClient.setQueryData(['whatsapp', 'messages', newMessage.conversationId], (old: Message[] = []) => [
        ...old,
        optimisticMessage as Message,
      ]);

      return { previousMessages, tempId };
    },
    onError: (err, newMessage, context) => {
      // Em vez de remover a mensagem otimista (o que fazia o arquivo "sumir"
      // silenciosamente), marcamos como 'failed' para o usuário ver que falhou.
      if (context?.tempId) {
        queryClient.setQueryData(
          ['whatsapp', 'messages', newMessage.conversationId],
          (old: Message[] = []) =>
            old.map((msg) =>
              msg.id === context.tempId ? { ...msg, status: 'failed' } : msg
            )
        );
      }

      toast({
        title: 'Falha ao enviar',
        description: err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    },
    onSuccess: (data, variables) => {
      // Só sincroniza com o banco quando o envio realmente deu certo. Em caso
      // de erro mantemos o balão 'failed' visível (não invalidamos a query).
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
  });

  return mutation;
};
