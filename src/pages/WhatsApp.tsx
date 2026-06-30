import { useState, useEffect } from "react";
import { ConversationsSidebar } from "@/components/conversations";
import { ChatArea, ConversationDetailsSidebar } from "@/components/chat";
import { useWhatsAppInstances, useWhatsAppConversations } from "@/hooks/whatsapp";
import { useNotifications } from "@/hooks/useNotifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { useInstanceStatusMonitor } from "@/hooks/useInstanceStatusMonitor";
import { DisconnectedInstancesBanner } from "@/components/notifications/DisconnectedInstancesBanner";
import { Button } from "@/components/ui/button";
import { Settings, ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

const WhatsApp = () => {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { setSelectedConversationId } = useNotifications();
  const [isDetailsSidebarCollapsed, setIsDetailsSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches,
  );
  const [isConversationsSidebarCollapsed, setIsConversationsSidebarCollapsed] = useState(false);
  const { instances } = useWhatsAppInstances();
  const { disconnectedInstances } = useInstanceStatusMonitor();
  const isMobile = useIsMobile();

  // Show all conversations from all instances by default; allow ?instance=<id>
  // (used by the post-sync toast) to pre-filter to a single instance.
  const [searchParams] = useSearchParams();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>(
    () => searchParams.get("instance") ?? undefined,
  );

  // Fetch conversations to get contact name
  const { conversations } = useWhatsAppConversations({ instanceId: selectedInstanceId });
  const selectedConv = conversations.find(c => c.id === selectedConversation);

  // Inform NotificationContext about open conversation
  useEffect(() => {
    setSelectedConversationId(selectedConversation);
    return () => setSelectedConversationId(null);
  }, [selectedConversation, setSelectedConversationId]);

  // ESC fecha a conversa aberta (volta para tela inicial), exceto se o foco
  // estiver em input/textarea/contenteditable (composer, busca, modais Radix etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (!selectedConversation) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      setSelectedConversation(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConversation]);

  const handleSelectConversation = (id: string | null) => {
    setSelectedConversation(id);
  };

  const handleBackToSidebar = () => {
    setSelectedConversation(null);
  };

  // Mobile: show sidebar OR chat, never both
  const showSidebar = !isMobile || !selectedConversation;
  const showChat = !isMobile || selectedConversation;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* Disconnected Instances Banner */}
      <DisconnectedInstancesBanner instances={disconnectedInstances} />
      
      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      {showSidebar && (
        <div className={`${isMobile ? "w-full" : isConversationsSidebarCollapsed ? "w-14" : "w-[350px]"} border-r border-border`}>
          <ConversationsSidebar
            selectedId={selectedConversation}
            onSelect={handleSelectConversation}
            instanceId={selectedInstanceId}
            isCollapsed={!isMobile && isConversationsSidebarCollapsed}
            onToggleCollapse={() => setIsConversationsSidebarCollapsed(!isConversationsSidebarCollapsed)}
          />
        </div>
      )}

      {/* Chat Area */}
      {showChat && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile back button */}
          {isMobile && selectedConversation && (
            <div className="border-b border-border p-2">
              <Button variant="ghost" size="sm" onClick={handleBackToSidebar}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            </div>
          )}
          <ChatArea conversationId={selectedConversation} />
        </div>
      )}

      {/* Details Sidebar - hidden on mobile */}
      {!isMobile && (
        <ConversationDetailsSidebar
          conversationId={selectedConversation}
          contactName={selectedConv?.contact?.name}
          isCollapsed={isDetailsSidebarCollapsed}
          onToggleCollapse={() => setIsDetailsSidebarCollapsed(!isDetailsSidebarCollapsed)}
        />
      )}

      {/* No instance state */}
      {instances.length === 0 && !selectedConversation && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Nenhuma instância configurada</p>
            <Link to="/whatsapp/settings">
              <Button>
                <Settings className="mr-2 h-4 w-4" />
                Configurar Instância
              </Button>
            </Link>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default WhatsApp;
