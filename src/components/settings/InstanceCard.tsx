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
import { useWhatsAppInstances, useSyncWhatsAppHistory, useSyncJob, useSyncJobCompletion, type SyncJob } from "@/hooks/whatsapp";
import { RefreshCw, Pencil, Trash2, Copy, Link, Download, Loader2, Plug, Stethoscope, Users } from "lucide-react";
import { toast } from "sonner";
import { EditInstanceDialog } from "./EditInstanceDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Instance = Tables<"whatsapp_instances">;

interface InstanceCardProps {
  instance: Instance;
}

export const InstanceCard = ({ instance }: InstanceCardProps) => {
  const { testConnection, deleteInstance, reconnectInstance, diagnoseInstance, resolveLidConversations } = useWhatsAppInstances();
  const syncHistory = useSyncWhatsAppHistory();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [diagnosis, setDiagnosis] = useState<any | null>(null);
  const [showDiagnosisDialog, setShowDiagnosisDialog] = useState(false);

  const { data: syncJob } = useSyncJob(instance.id);

  useSyncJobCompletion(instance.id, (job: SyncJob) => {
    const chats = job.chats_synced ?? 0;
    const msgs = job.messages_synced ?? 0;
    const contacts = job.contacts_synced ?? 0;
    const base = `${chats} conversas, ${msgs} mensagens e ${contacts} contatos sincronizados`;
    if (job.status === 'failed') {
      toast.error(job.error_message || `Sincronização falhou. ${base}.`);
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
        },
      );
      return;
    }
    toast.success(base, {
      duration: 12000,
      action: chats > 0
        ? {
            label: "Ver conversas",
            onClick: () => navigate(`/whatsapp?instance=${instance.id}`),
          }
        : undefined,
    });
  });

  const isRunning = syncJob?.status === 'running';
  const lastSyncUpdateMs = syncJob?.updated_at ? new Date(syncJob.updated_at).getTime() : 0;
  const isSyncStale = isRunning && lastSyncUpdateMs > 0 && Date.now() - lastSyncUpdateMs > 5 * 60 * 1000;
  const isSyncing = (isRunning && !isSyncStale) || syncHistory.isPending;

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada!");
  };

  const handleTestConnection = async () => {
    try {
      // Faz até 3 tentativas se a Evolution responder "connecting" (estado
      // transitório do Baileys que dura poucos segundos quando o socket renova).
      let result: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        result = await testConnection.mutateAsync(instance.id);
        if (result?.mappedStatus === 'connected') break;
        if (result?.evolutionState !== 'connecting') break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const status = result?.mappedStatus;
      if (status === 'connected') toast.success("Conexão OK — instância conectada.");
      else if (status === 'connecting') toast.info("Instância está reconectando. Aguarde alguns segundos e teste novamente.");
      else toast.error("Instância desconectada. Use 'Reconectar' para forçar o socket sem perder a sessão.");
    } catch (error) {
      toast.error("Falha ao testar conexão");
    }
  };

  const handleReconnect = async () => {
    try {
      const result = await reconnectInstance.mutateAsync(instance.id);
      if (result?.alreadyConnected) {
        toast.success("Instância já está conectada — nada a fazer.");
      } else if (result?.stillConnecting) {
        toast.info("Baileys já está reconectando. Aguarde alguns segundos e teste novamente.");
      } else if (result?.qr) {
        toast.info("Sessão expirada — gere o QR Code para reconectar.", { duration: 8000 });
      } else {
        toast.success("Reconexão disparada. Aguarde alguns segundos e teste a conexão.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Falha ao reconectar instância");
    }
  };

  const handleDiagnose = async () => {
    try {
      const result = await diagnoseInstance.mutateAsync(instance.id);
      setDiagnosis(result);
      setShowDiagnosisDialog(true);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao diagnosticar instância");
    }
  };

  const handleResolveLid = async () => {
    try {
      const result = await resolveLidConversations.mutateAsync({ id: instance.id });
      const s = result?.stats ?? {};
      toast.success(
        `Conversas @lid processadas: ${s.merged ?? 0} fundidas, ${s.renamed ?? 0} renomeadas, ${s.unresolved ?? 0} sem mapeamento (de ${s.totalOrphans ?? 0}).`,
        { duration: 10000 },
      );
    } catch (error: any) {
      toast.error(error?.message || "Falha ao resolver conversas @lid");
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
      if (result.restarted) {
        toast.info("Sincronização retomada. Agora as conversas e mensagens serão priorizadas.");
      } else if (result.reused) {
        toast.info("Sincronização já em andamento — acompanhando o progresso.");
      } else {
        toast.success("Sincronização iniciada em background. Você pode fechar esta aba.");
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
            title="Testar conexão"
          >
            <RefreshCw className={`h-4 w-4 ${testConnection.isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReconnect}
            disabled={reconnectInstance.isPending}
            title="Reconectar (força o socket sem perder a sessão)"
          >
            {reconnectInstance.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDiagnose}
            disabled={diagnoseInstance.isPending}
            title="Diagnosticar (consulta a Evolution e mostra o estado real do socket)"
          >
            {diagnoseInstance.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Stethoscope className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResolveLid}
            disabled={resolveLidConversations.isPending}
            title="Resolver conversas @lid (funde órfãs sem mensagens com a conversa real)"
          >
            {resolveLidConversations.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSyncDialog(true)}
            disabled={instance.status !== "connected" || syncHistory.isPending || (isRunning && !isSyncStale)}
            title={isSyncStale ? "Retomar sincronização travada" : isSyncing ? "Sincronização em andamento" : "Sincronizar histórico"}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
          {isRunning && (
            <span className="text-xs text-muted-foreground self-center">
              {isSyncStale ? "Parou; clique para retomar" : "Sincronizando…"} {syncJob.chats_synced} conv. / {syncJob.messages_synced} msgs / {syncJob.contacts_synced} contatos
            </span>
          )}
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

      <Dialog open={showDiagnosisDialog} onOpenChange={setShowDiagnosisDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Diagnóstico da instância</DialogTitle>
            <DialogDescription>
              Estado real reportado pela Evolution agora — útil quando o status no banco
              não corresponde ao comportamento no envio.
            </DialogDescription>
          </DialogHeader>
          {diagnosis && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-muted-foreground">Status no banco</div>
                  <div className="font-medium">{diagnosis.databaseStatus}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Estado na Evolution</div>
                  <div className="font-medium">{diagnosis.evolution?.connectionState ?? '—'}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground">Veredito</div>
                  <div className="font-medium">{diagnosis.verdict}</div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Detalhes brutos</div>
                <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-72">
{JSON.stringify(diagnosis, null, 2)}
                </pre>
              </div>
              {diagnosis.verdict === 'evolution_socket_closed' && (
                <p className="text-xs text-muted-foreground">
                  O socket Baileys está fechado. Clique em "Reconectar" para forçar reabertura;
                  se vier QR Code, a sessão expirou e você precisa escanear de novo.
                </p>
              )}
              {diagnosis.verdict === 'evolution_says_connected' && (
                <p className="text-xs text-muted-foreground">
                  A Evolution diz que está conectada. Se ainda assim o envio falha com
                  "Connection Closed", o problema está no servidor Evolution (versão do
                  WhatsApp Web em <code>CONFIG_SESSION_PHONE_VERSION</code> desatualizada
                  é a causa mais comum).
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
