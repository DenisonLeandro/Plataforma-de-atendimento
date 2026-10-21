import { AlertTriangle, ExternalLink, Copy, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface MediaBlockedByClientHintProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  url?: string;
}

/**
 * Passo a passo mostrado quando uma extensão do navegador bloqueia o arquivo
 * (ERR_BLOCKED_BY_CLIENT). Só abre por clique do usuário — nunca sozinho.
 */
export const MediaBlockedByClientHint = ({ open, onOpenChange, onRetry, url }: MediaBlockedByClientHintProps) => {
  const { toast } = useToast();

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", description: "Cole em uma nova aba para abrir ou baixar." });
    } catch {
      toast({ title: "Não foi possível copiar o link", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            O navegador bloqueou este arquivo
          </DialogTitle>
          <DialogDescription>
            Um bloqueador de anúncios ou antivírus do seu navegador impediu a foto
            de aparecer. O arquivo está salvo normalmente.
          </DialogDescription>
        </DialogHeader>

        {url && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <p className="text-sm font-medium">Jeito mais rápido:</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir em nova aba
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copiar link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Na nova aba, clique com o botão direito na foto e escolha "Salvar imagem como".
            </p>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <p className="font-medium">Para resolver de vez (30 segundos):</p>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>No canto de cima à direita do navegador, clique no ícone do bloqueador (AdBlock, uBlock, AdGuard, antivírus) ou no quebra-cabeça 🧩.</li>
            <li>Clique em <strong>"Desativar neste site"</strong> ou <strong>"Pausar neste site"</strong>.</li>
            <li>Aperte <strong>F5</strong> para recarregar a página.</li>
            <li>Ainda não deu? Teste numa <strong>aba anônima</strong> (Ctrl + Shift + N).</li>
          </ol>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
