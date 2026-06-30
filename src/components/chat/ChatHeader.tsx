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
  const { user, isAdmin, isSupervisor } = useAuth();
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
    <div className="p-4 border-b border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="w-10 h-10">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className={cn(
                "text-base font-semibold truncate min-w-0",
                nameIsMissing ? "text-muted-foreground italic" : "text-foreground"
              )}>
                {displayName}
              </h2>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0" 
                onClick={() => setIsEditContactModalOpen(true)}
                title="Editar contato"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
            <p className={cn(
              "text-xs text-muted-foreground",
              phoneIsLid && "italic"
            )}>
              {phoneIsLid ? 'Telefone não identificado' : contact.phone_number}
            </p>
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

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Assignment buttons */}
          {conversation && showAssumir && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAssumeFromQueue}
              title="Assumir conversa"
            >
              <UserPlus className="w-4 h-4 xl:mr-2" />
              <span className="hidden xl:inline">Assumir</span>
            </Button>
          )}

          {conversation && showTransferir && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAssignDialogOpen(true)}
              title="Transferir conversa"
            >
              <Repeat className="w-4 h-4 xl:mr-2" />
              <span className="hidden xl:inline">Transferir</span>
            </Button>
          )}

          <SentimentCard sentiment={sentiment} />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onAnalyze}
            disabled={isAnalyzing}
            title="Analisar conversa"
          >
            <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline ml-2">Analisar</span>
          </Button>

          {conversation && (
            <ChatHeaderMenu conversation={conversation} onRefresh={onRefresh} />
          )}

          <Link to="/whatsapp/settings">
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
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
