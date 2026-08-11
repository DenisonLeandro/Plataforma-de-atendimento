import { Loader2, PlugZap } from "lucide-react";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { InstanceConnectionCard } from "./InstanceConnectionCard";

/**
 * Aba "Conexão": o lugar onde o cliente resolve sozinho a queda do WhatsApp.
 *
 * Mostra apenas as instâncias da empresa dele (o hook já filtra por
 * company_id) e nada de configuração técnica — essa continua na aba
 * Instâncias, para quem dá suporte.
 */
export const ConnectionTab = () => {
  const { instances, isLoading } = useWhatsAppInstances();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando conexões…
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
        <PlugZap className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Nenhum número configurado ainda</p>
          <p className="text-sm text-muted-foreground">
            Assim que um número de WhatsApp for cadastrado, ele aparece aqui para você conectar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecte ou desconecte o WhatsApp da sua empresa. Se as mensagens pararem de chegar, é aqui
        que você resolve — sem precisar de suporte.
      </p>

      <div className="grid gap-4">
        {instances.map((instance) => (
          <InstanceConnectionCard key={instance.id} instance={instance} />
        ))}
      </div>
    </div>
  );
};
