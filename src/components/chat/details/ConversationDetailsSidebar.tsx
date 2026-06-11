import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { ConversationSentiment } from './ConversationSentiment';
import { ConversationSummaries } from './ConversationSummaries';
import { ConversationNotes } from './ConversationNotes';
import { ConversationTopics } from '../topics/ConversationTopics';

interface ConversationDetailsSidebarProps {
  conversationId: string | null;
  contactName?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function ConversationDetailsSidebar({
  conversationId,
  contactName,
  isCollapsed,
  onToggleCollapse
}: ConversationDetailsSidebarProps) {

  if (isCollapsed) {
    return (
      <div className="w-14 h-full border-l border-subtle bg-bg-surface flex flex-col items-center p-2 gap-2">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <MessageSquare className="h-5 w-5 text-muted-foreground mt-2" />
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="w-full h-full border-l border-subtle bg-bg-surface flex flex-col">
        <div className="px-6 py-5 border-b border-hairline flex items-center justify-between">
          <h3 className="text-[15px] font-semibold tracking-tight">Detalhes da Conversa</h3>
          <Button variant="ghost" size="icon" onClick={onToggleCollapse}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-text-secondary text-center max-w-[220px]">
            Selecione uma conversa para ver os detalhes
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full border-l border-subtle bg-bg-surface flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-hairline flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-semibold">Detalhes da Conversa</h3>
          {contactName && (
            <p className="text-xs text-muted-foreground">{contactName}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden details-scroll">
        <div className="p-4 pb-6 space-y-6">
          {/* Sentimento */}
          <ConversationSentiment conversationId={conversationId} />

          <Separator />

          {/* Tópicos */}
          <ConversationTopics conversationId={conversationId} />

          <Separator />

          {/* Resumos AI */}
          <ConversationSummaries conversationId={conversationId} />

          <Separator />

          {/* Observações */}
          <ConversationNotes conversationId={conversationId} />
        </div>
      </div>
    </div>
  );
}