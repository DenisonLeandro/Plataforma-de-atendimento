import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';

type WhatsAppInstance = Tables<'whatsapp_instances'>;

interface DisconnectedInstancesBannerProps {
  instances: WhatsAppInstance[];
}

export const DisconnectedInstancesBanner = ({ instances }: DisconnectedInstancesBannerProps) => {
  const [dismissed, setDismissed] = useState(false);
  const { isAdmin, isSupervisor } = useAuth();
  // Agente vê o aviso (precisa saber que as mensagens pararam), mas não recebe
  // um botão que o levaria a uma aba inexistente para ele.
  const canReconnect = isAdmin || isSupervisor;

  if (dismissed || instances.length === 0) return null;

  const instanceNames = instances.map((inst) => inst.name).join(', ');
  const isSingle = instances.length === 1;

  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 pr-10">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {isSingle ? 'Instância Desconectada' : `${instances.length} Instâncias Desconectadas`}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          {isSingle 
            ? `A instância "${instanceNames}" está desconectada.` 
            : `As instâncias ${instanceNames} estão desconectadas.`}
        </span>
        {/* Leva direto para a aba de conexão: o cliente cai exatamente na tela
            onde resolve, em vez de procurar entre as abas de configuração. */}
        {canReconnect && (
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link to="/whatsapp/settings?tab=connection">
              Reconectar agora →
            </Link>
          </Button>
        )}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 text-destructive hover:text-destructive/80 hover:bg-transparent"
        onClick={() => setDismissed(true)}
        aria-label="Fechar aviso"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
};
