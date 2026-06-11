import { useState } from "react";
import { useWhatsAppMessages, useWhatsAppSend, useWhatsAppSentiment } from "@/hooks/whatsapp";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      content,
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
    });
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-app">
        <div className="text-center space-y-3 max-w-[280px] px-6">
          <div className="animate-float inline-block drop-shadow-[var(--shadow-xs)]">
            <MessageCircle
              className="w-16 h-16 mx-auto text-[hsl(var(--brand-primary)/0.18)]"
              strokeWidth={1.5}
            />
          </div>
          <h3 className="text-[17px] font-semibold text-text-primary tracking-tight">
            Selecione uma conversa
          </h3>
          <p className="text-[13px] text-text-secondary leading-5">
            Escolha uma conversa na lista ao lado para começar o atendimento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-bg-app">
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
