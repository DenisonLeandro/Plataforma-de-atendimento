import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RefreshCw, Settings, UserPlus, Repeat, Pencil } from "lucide-react";
import { SentimentCard } from "./SentimentCard";
import { Tables } from "@/integrations/supabase/types";
import { Link } from "react-router-dom";
import { useConversationTopics } from "@/hooks/whatsapp/useConversationTopics";
import { TopicBadges } from "./topics/TopicBadges";
import { ChatHeaderMenu } from "./ChatHeaderMenu";
import { QueueIndicator } from "@/components/conversations/QueueIndicator";
import { AssignAgentDialog } from "@/components/conversations/AssignAgentDialog";
import { EditContactModal } from "./EditContactModal";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useConversationAssignment } from "@/hooks/whatsapp/useConversationAssignment";
import { isContactNameMissing, isLidValue } from "@/utils/contactUtils";
import { useContactAvatar } from "@/hooks/useContactAvatar";
import { cn } from "@/lib/utils";

type Contact = Tables<'whatsapp_contacts'>;
type Sentiment = Tables<'whatsapp_sentiment_analysis'>;

interface ChatHeaderProps {
  contact?: Contact;
  sentiment?: Sentiment | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  conversationId?: string;
  conversation?: any;
  onRefresh?: () => void;
}

export const ChatHeader = ({ contact, sentiment, isAnalyzing, onAnalyze, conversationId, conversation, onRefresh }: ChatHeaderProps) => {
  const { data: topicsData } = useConversationTopics(conversationId || null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isEditContactModalOpen, setIsEditContactModalOpen] = useState(false);
  const { user, isAdmin, isSupervisor, isReadOnlyView } = useAuth();
  const { assignConversation } = useConversationAssignment();
  const avatarUrl = useContactAvatar(contact?.profile_picture_url ?? null);

  if (!contact) return null;
  
  const nameIsMissing = isContactNameMissing(contact.name, contact.phone_number);
  const displayName = nameIsMissing ? 'Sem nome' : contact.name;
  const phoneIsLid = isLidValue(contact.phone_number);

  const isInQueue = !conversation?.assigned_to;
  const isAssignedToMe = conversation?.assigned_to === user?.id;
  const canManageOthers = isAdmin || isSupervisor;
  const showAssumir = (isInQueue || canManageOthers) && !isAssignedToMe;
  const showTransferir = isInQueue || isAssignedToMe || canManageOthers;

  const handleAssumeFromQueue = () => {
    if (conversationId && user?.id) {
      assignConversation({ conversationId, assignedTo: user.id });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="border-b border-border bg-card px-3 py-3 sm:px-4">
      <div className="flex min-w-0 flex-col gap-2">
        {/* Identidade do contato: nome e número nunca disputam espaço com ações */}
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <h2 className={cn(
                  "block truncate text-base font-semibold leading-tight",
                  nameIsMissing ? "text-muted-foreground italic" : "text-foreground"
                )}>
                  {displayName}
                </h2>
                <p className={cn(
                  "mt-0.5 block truncate text-xs leading-tight text-muted-foreground",
                  phoneIsLid && "italic"
                )}>
                  {phoneIsLid ? 'Telefone não identificado' : contact.phone_number}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 flex-shrink-0 p-0" 
                onClick={() => setIsEditContactModalOpen(true)}
                disabled={isViewingAsCompany}
                title="Editar contato"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
            {topicsData?.topics && topicsData.topics.length > 0 && (
              <div className="mt-1">
                <TopicBadges topics={topicsData.topics} size="sm" showIcon={true} maxTopics={3} />
              </div>
            )}
            {conversation && (
              <div className="mt-1">
                <QueueIndicator
                  assignedTo={conversation.assigned_to}
                  assignedToName={conversation.assigned_profile?.full_name}
                />
              </div>
            )}
          </div>
        </div>

        {/* Ações da conversa em faixa própria para não cobrir nome/número */}
        <div className="-mx-1 flex min-w-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* Assignment buttons */}
          {conversation && showAssumir && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAssumeFromQueue}
              disabled={isViewingAsCompany}
              title="Assumir conversa"
              className="h-7 flex-shrink-0 px-2.5 text-xs"
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              <span>Assumir</span>
            </Button>
          )}

          {conversation && showTransferir && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAssignDialogOpen(true)}
              disabled={isViewingAsCompany}
              title="Transferir conversa"
              className="h-7 flex-shrink-0 px-2.5 text-xs"
            >
              <Repeat className="h-3.5 w-3.5 mr-1.5" />
              <span>Transferir</span>
            </Button>
          )}

          <SentimentCard sentiment={sentiment} />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onAnalyze}
            disabled={isAnalyzing || isViewingAsCompany}
            title="Analisar conversa"
            className="h-7 flex-shrink-0 px-2.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span className="ml-1.5">Analisar</span>
          </Button>

          <div className="flex flex-shrink-0 items-center gap-0.5">
            {conversation && (
              <ChatHeaderMenu conversation={conversation} onRefresh={onRefresh} disabled={isViewingAsCompany} />
            )}
            <Link to="/whatsapp/settings">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Assignment Dialog */}
      {conversation && conversationId && (
        <AssignAgentDialog
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          conversationId={conversationId}
          instanceId={conversation.instance_id ?? contact?.instance_id}
          currentAssignee={conversation.assigned_to}
          isTransfer={!isInQueue}
        />
      )}
      
      {/* Edit Contact Modal */}
      <EditContactModal
        open={isEditContactModalOpen}
        onOpenChange={setIsEditContactModalOpen}
        contactId={contact.id}
        contactName={contact.name}
        contactPhone={contact.phone_number}
        contactNotes={contact.notes || ''}
        onSuccess={() => {
          setIsEditContactModalOpen(false);
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
