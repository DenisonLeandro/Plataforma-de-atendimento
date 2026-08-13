import { useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Mail, Archive, UserPlus, ArrowLeftRight } from 'lucide-react';
import { useWhatsAppActions } from '@/hooks/whatsapp/useWhatsAppActions';
import { useConversationAssignment } from '@/hooks/whatsapp/useConversationAssignment';
import { useAuth } from '@/contexts/AuthContext';
import { AssignAgentDialog } from './AssignAgentDialog';

/** Só os campos que este menu realmente usa — a conversa completa é aceita. */
interface MenuConversation {
  id: string;
  unread_count?: number | null;
  assigned_to?: string | null;
  instance_id?: string | null;
}

interface ConversationItemMenuProps {
  conversation: MenuConversation;
  children: React.ReactNode;
}

export function ConversationItemMenu({
  conversation,
  children,
}: ConversationItemMenuProps) {
  const { markAsUnread, archiveConversation, isMarkingUnread, isArchiving } =
    useWhatsAppActions();
  const { assignConversation, isAssigning } = useConversationAssignment();
  const { user, isAdmin, isSupervisor, isReadOnlyView } = useAuth();
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  // Mesmas regras do cabeçalho do chat (ChatHeader), de propósito: duas telas
  // que oferecem a mesma ação não podem discordar sobre quem pode executá-la.
  // A autorização de verdade vive no RPC assign_conversation, que valida acesso,
  // empresa e destinatário no servidor — aqui só decidimos o que mostrar.
  const isInQueue = !conversation?.assigned_to;
  const isAssignedToMe = conversation?.assigned_to === user?.id;
  const canManageOthers = isAdmin || isSupervisor;

  // Super admin visitando outra empresa sem permissão de escrita não atribui nada.
  const canAssign = !isReadOnlyView;
  const showAssumir = canAssign && (isInQueue || canManageOthers) && !isAssignedToMe;
  const showTransferir = canAssign && (isInQueue || isAssignedToMe || canManageOthers);
  const showAssignmentGroup = showAssumir || showTransferir;

  const handleMarkUnread = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAsUnread(conversation.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    archiveConversation(conversation.id);
  };

  const handleAssumir = (e: React.MouseEvent) => {
    // stopPropagation em todos os itens: sem isso o clique atravessa o menu e
    // abre a conversa por baixo, tirando o usuário da lista sem querer.
    e.stopPropagation();
    if (!user?.id) return;
    assignConversation({ conversationId: conversation.id, assignedTo: user.id });
  };

  const handleTransferir = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTransferOpen(true);
  };

  const isRead = (conversation.unread_count || 0) === 0;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52 bg-background">
          {showAssumir && (
            <ContextMenuItem
              onClick={handleAssumir}
              disabled={isAssigning}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Assumir conversa
            </ContextMenuItem>
          )}

          {showTransferir && (
            <ContextMenuItem onClick={handleTransferir}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Transferir para...
            </ContextMenuItem>
          )}

          {showAssignmentGroup && <ContextMenuSeparator />}

          {isRead && (
            <ContextMenuItem
              onClick={handleMarkUnread}
              disabled={isMarkingUnread}
            >
              <Mail className="mr-2 h-4 w-4" />
              Marcar como não lida
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={handleArchive}
            disabled={isArchiving}
          >
            <Archive className="mr-2 h-4 w-4" />
            Arquivar
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Fora do ContextMenu de propósito: renderizado dentro dele, o diálogo
          seria desmontado junto com o menu ao fechar, e o usuário veria a
          janela piscar e sumir. */}
      {isTransferOpen && (
        <AssignAgentDialog
          open={isTransferOpen}
          onOpenChange={setIsTransferOpen}
          conversationId={conversation.id}
          instanceId={conversation.instance_id}
          currentAssignee={conversation.assigned_to}
          isTransfer={!isInQueue}
        />
      )}
    </>
  );
}
