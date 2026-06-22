import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWhatsAppInstances, useSyncWhatsAppHistory } from "@/hooks/whatsapp";
import { RefreshCw, Pencil, Trash2, Copy, Link, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EditInstanceDialog } from "./EditInstanceDialog";

type Instance = Tables<"whatsapp_instances">;

interface InstanceCardProps {
  instance: Instance;
}

export const InstanceCard = ({ instance }: InstanceCardProps) => {
  const { testConnection, deleteInstance } = useWhatsAppInstances();
  const syncHistory = useSyncWhatsAppHistory();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada!");
  };

  const handleTestConnection = async () => {
    try {
      await testConnection.mutateAsync(instance.id);
      toast.success("Conexão testada com sucesso!");
    } catch (error) {
      toast.error("Falha ao testar conexão");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteInstance.mutateAsync(instance.id);
      toast.success("Instância excluída com sucesso");
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error("Erro ao excluir instância");
    }
  };

  const handleSync = async () => {
    setShowSyncDialog(false);
    try {
      const result = await syncHistory.mutateAsync(instance.id);
      const chats = result.chats_synced ?? 0;
      const msgs = result.messages_synced ?? 0;
      const contacts = result.contacts_synced ?? 0;
      const warnCount = result.errors?.length ?? 0;
      const base = `${chats} conversas, ${msgs} mensagens e ${contacts} contatos sincronizados`;
      if (result.continued) {
        toast.warning(result.message || `${base}. Sincronização pausada — execute novamente para continuar.`);
        return;
      }
      if (chats === 0 && contacts > 0) {
        toast.info(
          `Contatos importados (${contacts}). Nenhuma conversa disponível no Evolution ainda — o WhatsApp só envia histórico conforme novas mensagens chegam à instância.`,
          {
            duration: 12000,
            action: {
              label: "Ver contatos",
              onClick: () => navigate(`/whatsapp/contatos?instance=${instance.id}`),
            },
          }
        );
        return;
      }
      if (warnCount > 0) {
        toast.warning(`${base} (${warnCount} avisos — veja console)`);
      } else {
        toast.success(base);
      }
    } catch (error: any) {
      toast.error(error?.message || "Falha ao sincronizar histórico");
    }
  };

  const getStatusColor = () => {
    switch (instance.status) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500";
      default:
        return "bg-red-500";
    }
  };

  const getStatusText = () => {
    switch (instance.status) {
      case "connected":
        return "Conectado";
      case "connecting":
        return "Conectando";
      default:
        return "Desconectado";
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
                {instance.name}
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {instance.instance_name}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Status:</span>{" "}
            <span className="font-medium">{getStatusText()}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Criado em {new Date(instance.created_at).toLocaleDateString("pt-BR")}
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link className="h-3.5 w-3.5" />
              <span>Webhook:</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-2 py-1.5 rounded text-xs break-all select-all font-mono">
                {webhookUrl}
              </code>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={copyWebhookUrl}
                className="h-8 w-8 p-0 shrink-0"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testConnection.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${testConnection.isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSyncDialog(true)}
            disabled={instance.status !== "connected" || syncHistory.isPending}
            title="Sincronizar histórico"
          >
            {syncHistory.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditDialog(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instância?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as conversas e mensagens
              associadas a esta instância serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sincronizar histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai importar contatos, conversas e mensagens que a Evolution API tem em cache para esta instância. Pode demorar alguns minutos. Mensagens já importadas não serão duplicadas.
              {"\n\n"}
              Importante: o WhatsApp não envia o histórico completo para instâncias recém-conectadas — só as conversas que receberem mensagens depois da conexão aparecerão aqui. Se essa instância acabou de ser criada, é normal vir só os contatos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSync}>Sincronizar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <EditInstanceDialog
        instance={instance}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
    </>
  );
};
