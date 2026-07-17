import { AlertTriangle, ShieldOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface MediaBlockedByClientHintProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
}

/**
 * Explicação e passo a passo mostrados quando o download da mídia é bloqueado
 * por uma extensão do navegador (ERR_BLOCKED_BY_CLIENT). O servidor nunca é
 * chamado nesse caso — é a extensão do usuário que corta a requisição.
 */
export const MediaBlockedByClientHint = ({ open, onOpenChange, onRetry }: MediaBlockedByClientHintProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Download bloqueado pelo navegador
          </DialogTitle>
          <DialogDescription>
            Uma extensão do seu navegador (bloqueador de anúncios, antivírus ou
            proteção de privacidade) impediu o carregamento deste arquivo. Nada
            está errado com a plataforma — a requisição foi cancelada antes de
            sair do seu computador (<code className="text-xs">ERR_BLOCKED_BY_CLIENT</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="font-medium">Como resolver (leva 30 segundos):</p>
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
            <li>
              Clique no ícone da extensão de bloqueio (uBlock, AdGuard, Brave
              Shield, Kaspersky, AdBlock, etc.) na barra do Chrome.
            </li>
            <li>
              Selecione <strong>Desativar neste site</strong> (ou "Pausar
              proteção neste site") e recarregue a página.
            </li>
            <li>
              Se ainda não funcionar, adicione uma exceção para os domínios:
              <div className="mt-1 rounded bg-muted p-2 font-mono text-xs">
                *.supabase.co<br />
                *.lovable.app
              </div>
            </li>
            <li>
              Para confirmar que o problema é a extensão, abra uma
              <strong> aba anônima</strong> — se o arquivo abrir lá, é a extensão.
            </li>
          </ol>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={onRetry}>
            <ShieldOff className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};