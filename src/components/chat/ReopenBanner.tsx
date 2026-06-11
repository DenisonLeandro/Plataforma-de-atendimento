import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ReopenBannerProps {
  conversationId: string;
  status?: string | null;
  metadata?: any;
}

export function ReopenBanner({ conversationId, status, metadata }: ReopenBannerProps) {
  const [localDismissed, setLocalDismissed] = useState(false);
  const queryClient = useQueryClient();

  const meta = metadata || {};
  const reopenedAt = meta.reopened_at ? new Date(meta.reopened_at) : null;
  const show =
    status === "reopened" &&
    !meta.reopen_banner_dismissed &&
    !localDismissed &&
    reopenedAt &&
    Date.now() - reopenedAt.getTime() < 24 * 60 * 60 * 1000;

  if (!show || !reopenedAt) return null;

  const handleDismiss = async () => {
    setLocalDismissed(true);
    await supabase
      .from("whatsapp_conversations")
      .update({ metadata: { ...meta, reopen_banner_dismissed: true } })
      .eq("id", conversationId);
    queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations"] });
  };

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[hsl(var(--accent-soft))] text-text-primary text-[13px] border-b border-hairline">
      <RefreshCw className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--accent-h))]" />
      <span className="flex-1">
        Conversa reaberta automaticamente em{" "}
        <span className="tabular font-medium">
          {format(reopenedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </span>{" "}
        — cliente enviou nova mensagem
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        className="h-6 w-6 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-[hsl(var(--accent-h)/0.10)] transition-colors"
        aria-label="Dispensar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}