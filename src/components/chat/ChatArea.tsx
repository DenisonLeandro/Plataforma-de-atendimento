import { useState } from "react";
import { useWhatsAppMessages, useWhatsAppSend, useWhatsAppSentiment } from "@/hooks/whatsapp";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChatHeader } from "./ChatHeader";
import { MessagesContainer } from "./MessagesContainer";
import { MessageInputContainer, MediaSendParams } from "./input";
import { MessageCircle } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Message = Tables<'whatsapp_messages'>;

interface ChatAreaProps {
  conversationId: string | null;
}

export const ChatArea = ({ conversationId }: ChatAreaProps) => {
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { messages, isLoading: messagesLoading } = useWhatsAppMessages(conversationId);
  const { sentiment, isAnalyzing, analyze } = useWhatsAppSentiment(conversationId);
  const sendMutation = useWhatsAppSend();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // Prefixa o nome do atendente logado em toda mensagem enviada ao cliente,
  // para controle de quem respondeu (ex.: "Denison: bom dia"). Sem nome no
  // perfil, ou para mídia sem legenda, mantém o conteúdo original.
  const senderName = profile?.full_name?.trim();
  const withSender = (content?: string) =>
    senderName && content?.trim() ? `${senderName}: ${content}` : content;

  // Fetch conversation details including contact
  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          contact:whatsapp_contacts(*)
        `)
        .eq('id', conversationId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  const handleRefresh = () => {
    if (!conversationId) return;
    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
  };

  const handleSendText = (content: string, quotedMessageId?: string) => {
    if (!conversationId || !content.trim()) return;

    sendMutation.mutate({
      conversationId,
      content: withSender(content),
      messageType: 'text',
      quotedMessageId,
    });
    setReplyingTo(null);
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSendMedia = (params: MediaSendParams) => {
    if (!conversationId) return;

    sendMutation.mutate({
      conversationId,
      ...params,
      content: withSender(params.content),
    });
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3">
          <MessageCircle className="w-24 h-24 mx-auto text-muted-foreground/40" />
          <h3 className="text-lg font-semibold text-foreground">
            Selecione uma conversa
          </h3>
          <p className="text-sm text-muted-foreground">
            Escolha uma conversa na lista para começar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      <ChatHeader
        contact={conversation?.contact}
        sentiment={sentiment}
        isAnalyzing={isAnalyzing}
        onAnalyze={analyze}
        conversationId={conversationId}
        conversation={conversation}
        onRefresh={handleRefresh}
      />
      
      <MessagesContainer 
        messages={messages} 
        isLoading={messagesLoading}
        conversationId={conversationId}
        onReplyMessage={handleReply}
      />
      
      <MessageInputContainer
        conversationId={conversationId}
        replyingTo={replyingTo}
        onSendText={handleSendText}
        onSendMedia={handleSendMedia}
        onCancelReply={handleCancelReply}
      />
    </div>
  );
};
