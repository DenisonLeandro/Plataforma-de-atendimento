import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { Check, CheckCheck, Clock, Reply, Pencil, User, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuotedMessagePreview } from "./QuotedMessagePreview";
import { ImageViewerModal } from "./ImageViewerModal";
import { MessageReactionButton } from "./MessageReactionButton";
import { useMessageReaction } from "@/hooks/whatsapp/useMessageReaction";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditHistoryPopover } from "./EditHistoryPopover";
import { EditMessageModal } from "./EditMessageModal";
import { useEditMessage } from "@/hooks/whatsapp/useEditMessage";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { isRawWhatsAppMediaUrl } from "@/utils/mediaUtils";
import { useSignedUrl } from "@/utils/signedUrl";

type Message = Tables<'whatsapp_messages'>;
type Reaction = Tables<'whatsapp_reactions'>;

interface MessageBubbleProps {
  message: Message;
  reactions?: Reaction[];
  onReply?: (message: Message) => void;
}

export const MessageBubble = ({ message, reactions = [], onReply }: MessageBubbleProps) => {
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFetchingMedia, setIsFetchingMedia] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const autoFetchedRef = useRef(false);
  const isFromMe = message.is_from_me;
  const time = format(new Date(message.timestamp), 'HH:mm');
  const { sendReaction } = useMessageReaction();
  const editMessage = useEditMessage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Stored media URLs point at a now-private bucket. Sign on the fly so
  // <img>/<video>/<a> tags can fetch the file.
  const signedMediaUrl = useSignedUrl(message.media_url ?? null);

  const mediaTypes = ['audio', 'image', 'video', 'document', 'sticker'];
  const isMissingMedia =
    mediaTypes.includes(message.message_type) && !message.media_url;
  const mediaStatus = (message as any).media_status as string | undefined;
  // Mídia residual apontando pro CDN cru do WhatsApp (.enc) — não recuperada pelo backfill.
  // Não auto-disparamos fetch aqui (evita tempestade de chamadas ao abrir a conversa);
  // mostramos UI graciosa com "Tentar novamente" manual.
  const hasRawMedia =
    mediaTypes.includes(message.message_type) &&
    !!message.media_url &&
    isRawWhatsAppMediaUrl(message.media_url);

  const messageTextClass = "min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]";

  const handleFetchMedia = async () => {
    setIsFetchingMedia(true);
    setFetchFailed(false);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-message-media', {
        body: { messageId: message.id },
      });
      const payload = data as any;
      // Soft-failure: media is gone from WhatsApp — mark as unavailable, no toast, no retry.
      if (payload?.unavailable) {
        setFetchFailed(true);
        return;
      }
      if (error || payload?.error) {
        throw new Error(error?.message || payload?.error);
      }
      await queryClient.invalidateQueries({
        queryKey: ['whatsapp', 'messages', message.conversation_id],
      });
    } catch (e: any) {
      setFetchFailed(true);
      console.warn('[MessageBubble] fetch media failed', e?.message);
    } finally {
      setIsFetchingMedia(false);
    }
  };

  // Auto-fetch missing media once when message mounts/updates.
  // We DO auto-fetch when status is 'pending' (webhook download still in-flight
  // or historical sync placeholder) — the cron reprocesses too, but a user
  // opening the chat shouldn't have to wait for the next cron tick.
  useEffect(() => {
    const shouldAutoFetch = isMissingMedia && !['unavailable'].includes(mediaStatus || '');
    if (shouldAutoFetch && !autoFetchedRef.current && !isFetchingMedia && !fetchFailed) {
      autoFetchedRef.current = true;
      handleFetchMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMissingMedia, mediaStatus]);

  // Check if message can be edited (within 15 minutes and text only)
  const canEdit = isFromMe && 
    message.message_type === 'text' && 
    (Date.now() - new Date(message.timestamp).getTime()) < 15 * 60 * 1000;

  const handleReact = (emoji: string) => {
    sendReaction.mutate({
      messageId: message.message_id,
      conversationId: message.conversation_id,
      emoji,
      reactorJid: message.remote_jid,
      isFromMe: true,
    });
  };

  const handleEditSave = (newContent: string) => {
    editMessage.mutate({
      messageId: message.message_id,
      conversationId: message.conversation_id,
      newContent,
    }, {
      onSuccess: () => {
        setIsEditModalOpen(false);
      },
    });
  };

  const getStatusIcon = () => {
    if (!isFromMe) return null;

    const GRAY = '#9CA3AF';
    const BLUE = '#3B82F6';
    const RED = '#EF4444';

    switch (message.status) {
      case 'sending':
      case 'pending':
        return <Clock size={14} style={{ color: GRAY }} />;
      case 'sent':
        return <Check size={14} style={{ color: GRAY }} />;
      case 'delivered':
        return <CheckCheck size={14} style={{ color: GRAY }} />;
      case 'read':
        return <CheckCheck size={14} style={{ color: BLUE }} />;
      case 'failed':
        return (
          <span
            title="Falha na entrega. Se várias mensagens falharem na mesma instância, faça uma reconexão limpa e leia o QR Code novamente."
            className="inline-flex"
          >
            <AlertCircle size={14} style={{ color: RED }} />
          </span>
        );
      default:
        return <Check size={14} style={{ color: GRAY }} />;
    }
  };

  const renderReactions = () => {
    if (!reactions || reactions.length === 0) return null;
    
    // Group reactions by emoji and count
    const grouped = reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return (
      <div className="flex gap-1 flex-wrap mt-1">
        {Object.entries(grouped).map(([emoji, count]) => (
          <span 
            key={emoji}
            className="px-1.5 py-0.5 bg-muted rounded-full text-xs flex items-center gap-1 border border-border"
          >
            <span className="text-sm">{emoji}</span>
            {count > 1 && <span className="text-muted-foreground font-medium">{count}</span>}
          </span>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    if (isMissingMedia || hasRawMedia) {
      const labels: Record<string, string> = {
        audio: 'Carregando áudio…',
        image: 'Carregando imagem…',
        video: 'Carregando vídeo…',
        document: 'Carregando documento…',
        sticker: 'Carregando figurinha…',
      };
      const permanentlyUnavailable = mediaStatus === 'unavailable';
      const failed = fetchFailed || mediaStatus === 'failed' || permanentlyUnavailable || (hasRawMedia && !isFetchingMedia);
      return (
        <div className="space-y-2">
          {failed ? (
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{permanentlyUnavailable ? 'Mídia expirada no WhatsApp.' : 'Mídia indisponível.'}</span>
              {!permanentlyUnavailable && (
                <button
                  type="button"
                  onClick={handleFetchMedia}
                  className="underline hover:opacity-80"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs opacity-80">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{labels[message.message_type] || 'Carregando mídia…'}</span>
            </div>
          )}
          {message.content && message.content !== '🎵 Áudio' && (
            <p className={cn("text-xs opacity-80", messageTextClass)}>{message.content}</p>
          )}
        </div>
      );
    }

    switch (message.message_type) {
      case 'image':
        return (
          <div className="space-y-2">
            {message.media_url && (
              <img
                src={signedMediaUrl}
                alt="Imagem"
                className="max-w-full sm:max-w-xs rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setViewerImage(signedMediaUrl ?? null)}
              />
            )}
            {message.content && <p className={cn("text-sm", messageTextClass)}>{message.content}</p>}
          </div>
        );
      
      case 'sticker':
        return (
          <div>
            {message.media_url && (
              <img
                src={signedMediaUrl}
                alt="Sticker"
                className="max-w-[150px] cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setViewerImage(signedMediaUrl ?? null)}
              />
            )}
          </div>
        );
      
      case 'audio':
        return (
          message.media_url && signedMediaUrl ? (
            <AudioMessagePlayer
              messageId={message.id}
              conversationId={message.conversation_id}
              mediaUrl={signedMediaUrl}
              mimetype={message.media_mimetype}
              transcription={(message as any).audio_transcription}
              transcriptionStatus={(message as any).transcription_status}
              isFromMe={isFromMe}
            />
          ) : null
        );
      
      case 'video':
        return (
          <div className="space-y-2">
            {message.media_url && (
              <video controls className="w-full max-w-xs rounded-md">
                <source src={signedMediaUrl} type={message.media_mimetype || 'video/mp4'} />
              </video>
            )}
            {message.content && <p className={cn("text-sm", messageTextClass)}>{message.content}</p>}
          </div>
        );
      
      case 'document':
        return (
          <div className="space-y-2">
            {message.media_url && (
              <a
                href={signedMediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 max-w-full items-start gap-2 text-sm underline [overflow-wrap:anywhere] [word-break:break-word]"
              >
                📄 {message.content || 'Documento'}
              </a>
            )}
          </div>
        );
      
      case 'contact':
      case 'contacts':
        return (
          <div className="flex min-w-0 max-w-full items-center gap-3 p-2 bg-muted/50 rounded-md sm:min-w-[200px]">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{message.content}</p>
              <p className="text-xs text-muted-foreground">Contato compartilhado</p>
            </div>
          </div>
        );
      
      default:
        return (
          <p className={cn("text-sm", messageTextClass)}>
            {message.content}
          </p>
        );
    }
  };

  return (
    <div
      className={cn(
        'flex group relative w-full min-w-0',
        isFromMe ? 'justify-end' : 'justify-start'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative w-fit max-w-[min(86%,44rem)] min-w-0">
        {isHovered && (
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-10",
            isFromMe ? "left-0 -translate-x-full -ml-1" : "right-0 translate-x-full ml-1"
          )}>
            <MessageReactionButton
              messageId={message.message_id}
              conversationId={message.conversation_id}
              onReact={handleReact}
              isFromMe={isFromMe}
            />
            {canEdit && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsEditModalOpen(true)}
                className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-sm hover:bg-accent"
                title="Editar mensagem"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onReply && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onReply(message)}
                className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-sm hover:bg-accent"
              >
                <Reply className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        <Card
          className={cn(
            'max-w-full min-w-0 overflow-visible p-3 space-y-1',
            message.message_type === 'sticker' && 'bg-transparent border-none shadow-none p-0',
            isFromMe
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-card-foreground'
          )}
        >
          {message.quoted_message_id && (
            <QuotedMessagePreview messageId={message.quoted_message_id} />
          )}
          
          {renderContent()}
          
          <div className="flex items-center justify-end gap-1.5 mt-1">
            <span
              className={cn(
                'text-xs',
                isFromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
              )}
            >
              {time}
            </span>
            {message.edited_at && (
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    className={cn(
                      "text-xs italic hover:underline cursor-pointer",
                      isFromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}
                  >
                    Editado
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-0 w-auto">
                  <EditHistoryPopover 
                    messageId={message.message_id}
                    currentContent={message.content}
                    originalContent={message.original_content}
                  />
                </PopoverContent>
              </Popover>
            )}
            {getStatusIcon()}
          </div>
        </Card>
        
        {renderReactions()}
      </div>

      <ImageViewerModal
        imageUrl={viewerImage}
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
      />

      <EditMessageModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentContent={message.content}
        onSave={handleEditSave}
        isLoading={editMessage.isPending}
      />
    </div>
  );
};
