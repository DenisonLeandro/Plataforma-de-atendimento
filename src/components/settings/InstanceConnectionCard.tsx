import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Power, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useInstanceConnection, type ConnectionState } from "@/hooks/whatsapp";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type Instance = Tables<"whatsapp_instances">;

/**
 * Cartão de conexão voltado ao cliente final.
 *
 * Deliberadamente separado do `InstanceCard`, que é o painel técnico com
 * webhook, @lid e sincronização de histórico. Aqui há uma decisão por vez, em
 * português comum: o dono da empresa precisa resolver a queda do WhatsApp
 * sozinho, sem entender nada de Evolution API.
 */

const STATUS_STYLES: Record<ConnectionState, { dot: string; text: string }> = {
  connected: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  degraded: { dot: "bg-destructive", text: "text-destructive" },
  awaiting_qr: { dot: "bg-amber-500 animate-pulse", text: "text-amber-600 dark:text-amber-400" },
  connecting: { dot: "bg-amber-500 animate-pulse", text: "text-amber-600 dark:text-amber-400" },
  disconnected: { dot: "bg-destructive", text: "text-destructive" },
};

const PHONE_STEPS = [
  "Abra o WhatsApp no celular que usa este número",
  "Toque em Mais opções (⋮) e depois em Aparelhos conectados",
  "Toque em Conectar um aparelho",
  "Aponte a câmera para o QR Code ao lado",
];

interface InstanceConnectionCardProps {
  instance: Instance;
}

export const InstanceConnectionCard = ({ instance }: InstanceConnectionCardProps) => {
  const connection = useInstanceConnection(instance);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [disconnectAcknowledged, setDisconnectAcknowledged] = useState(false);

  const {
    state,
    label,
    description,
    qrCode,
    qrImage,
    qrSecondsLeft,
    qrRotation,
    canOperate,
    isBusy,
  } = connection;

  const styles = STATUS_STYLES[state];
  const isConnected = state === "connected";
  const showQr = state === "awaiting_qr" && (qrCode || qrImage);

  const handleConnect = async () => {
    try {
      await connection.connect();
      toast.success(
        isConnected
          ? "Conexão verificada."
          : "Estamos gerando o QR Code. Ele aparece aqui em instantes."
      );
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível conectar agora. Tente novamente."));
    }
  };

  const handleDisconnect = async () => {
    try {
      await connection.disconnect();
      setShowDisconnectDialog(false);
      setDisconnectAcknowledged(false);
      toast.success("WhatsApp desconectado. Use Conectar quando quiser voltar.");
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível desconectar agora. Tente novamente."));
    }
  };

  const primaryLabel = isConnected
    ? "Verificar conexão"
    : state === "degraded"
      ? "Reconectar agora"
      : state === "awaiting_qr"
        ? "Gerar novo QR Code"
        : "Conectar meu WhatsApp";

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">{instance.name}</CardTitle>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} aria-hidden />
              <span className={`text-sm font-medium ${styles.text}`} role="status">
                {label}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">{description}</p>

          {showQr && (
            <div className="grid gap-5 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-[auto,1fr]">
              <div className="space-y-2">
                <div className="flex justify-center rounded-md bg-white p-3">
                  {/* `qr_code` é a string crua do WhatsApp e vira QR aqui.
                      Quando a Evolution manda apenas a imagem pronta, ela já
                      vem como data-URI e não pode ser re-encodada. */}
                  {qrCode ? (
                    <QRCodeSVG value={qrCode} size={188} level="M" includeMargin />
                  ) : (
                    <img src={qrImage!} alt="QR Code para conectar o WhatsApp" className="h-[188px] w-[188px]" />
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                  {qrSecondsLeft > 0
                    ? `Este código expira em ${qrSecondsLeft}s — um novo aparece sozinho.`
                    : "Gerando um novo código…"}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Smartphone className="h-4 w-4" />
                  Como conectar
                </div>
                <ol className="space-y-2">
                  {PHONE_STEPS.map((step, index) => (
                    <li key={step} className="flex gap-2.5 text-sm text-muted-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {qrRotation !== null && qrRotation >= 3 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    O código já foi renovado {qrRotation} vezes. Se não conseguir ler, confira se o
                    celular está com internet e tente aproximar a câmera.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleConnect} disabled={!canOperate || isBusy} className="min-w-[180px]">
              {isBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {primaryLabel}
            </Button>

            {(isConnected || state === "degraded") && (
              <Button
                variant="outline"
                onClick={() => setShowDisconnectDialog(true)}
                disabled={!canOperate || isBusy}
              >
                <Power className="mr-2 h-4 w-4" />
                Desconectar
              </Button>
            )}
          </div>

          {!canOperate && (
            <p className="text-xs text-muted-foreground">
              Apenas administradores e supervisores podem alterar a conexão.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={showDisconnectDialog}
        onOpenChange={(open) => {
          setShowDisconnectDialog(open);
          if (!open) setDisconnectAcknowledged(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Enquanto estiver desconectado, sua empresa não recebe nem envia mensagens por
              <strong> {instance.name}</strong>. As conversas já registradas continuam salvas.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Segunda confirmação explícita: desconectar exige um celular à mão
              para reparear, e quem clica sem saber disso fica sem atendimento. */}
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <Checkbox
              checked={disconnectAcknowledged}
              onCheckedChange={(checked) => setDisconnectAcknowledged(checked === true)}
              className="mt-0.5"
            />
            <span>
              Entendi que precisarei ler um QR Code novo, com o celular em mãos, para voltar a atender.
            </span>
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Impede o fechamento automático: o diálogo só sai quando a
                // desconexão realmente confirma, evitando falso positivo.
                event.preventDefault();
                handleDisconnect();
              }}
              disabled={!disconnectAcknowledged || isBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
