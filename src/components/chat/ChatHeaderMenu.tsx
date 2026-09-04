import { useState } from 'react';
import { MoreVertical, Edit, Archive, Download, RotateCcw, ArchiveRestore } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EditContactModal } from './EditContactModal';
import { useWhatsAppActions } from '@/hooks/whatsapp/useWhatsAppActions';
import { exportConversation } from '@/utils/exportConversation';
import { toast } from 'sonner';

interface ChatHeaderMenuProps {
  conversation: any;
  onRefresh?: () => void;
  disabled?: boolean;
}

export function ChatHeaderMenu({ conversation, onRefresh, disabled }: ChatHeaderMenuProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const { 
    archiveConversation, 
    unarchiveConversation,
    reopenConversation, 
    isArchiving, 
    isUnarchiving,
    isReopening 
  } = useWhatsAppActions();

  const handleArchive = () => {
    archiveConversation(conversation.id, {
      onSuccess: () => onRefresh?.(),
    });
  };

  const handleUnarchive = () => {
    unarchiveConversation(conversation.id, {
      onSuccess: () => onRefresh?.(),
    });
  };

  const handleReopen = () => {
    reopenConversation(conversation.id, {
      onSuccess: () => onRefresh?.(),
    });
  };

  const handleExport = async () => {
    try {
      await exportConversation(conversation.id);
      toast.success('Conversa exportada com sucesso');
    } catch (error) {
      toast.error('Erro ao exportar conversa');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={disabled}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-background z-50">
          <DropdownMenuItem onClick={() => setIsEditModalOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Editar contato
          </DropdownMenuItem>

          {conversation.status === 'closed' && (
            <DropdownMenuItem onClick={handleReopen} disabled={isReopening}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reabrir conversa
            </DropdownMenuItem>
          )}

          {conversation.status === 'archived' && (
            <DropdownMenuItem onClick={handleUnarchive} disabled={isUnarchiving}>
              <ArchiveRestore className="mr-2 h-4 w-4" />
              Desarquivar conversa
            </DropdownMenuItem>
          )}

          {conversation.status !== 'archived' && (
            <DropdownMenuItem onClick={handleArchive} disabled={isArchiving}>
              <Archive className="mr-2 h-4 w-4" />
              Arquivar conversa
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Exportar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditContactModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        contactId={conversation.contact.id}
        contactName={conversation.contact.name || ''}
        contactPhone={conversation.contact.phone_number}
        contactNotes={conversation.contact.notes}
        onSuccess={onRefresh}
      />
    </>
  );
}
