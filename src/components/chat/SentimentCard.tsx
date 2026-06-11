import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Sentiment = Tables<'whatsapp_sentiment_analysis'>;

interface SentimentCardProps {
  sentiment?: Sentiment | null;
}

export const SentimentCard = ({ sentiment }: SentimentCardProps) => {
  if (!sentiment) {
    return <Badge variant="neutral">Sem análise</Badge>;
  }

  const getEmoji = () => {
    switch (sentiment.sentiment) {
      case 'positive':
        return '😊';
      case 'negative':
        return '😟';
      default:
        return '😐';
    }
  };

  const getLabel = () => {
    switch (sentiment.sentiment) {
      case 'positive':
        return 'Positivo';
      case 'negative':
        return 'Negativo';
      default:
        return 'Neutro';
    }
  };

  const variantFor = (): 'success' | 'danger' | 'info' => {
    switch (sentiment.sentiment) {
      case 'positive': return 'success';
      case 'negative': return 'danger';
      default: return 'info';
    }
  };

  const lastAnalysis = formatDistanceToNow(new Date(sentiment.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variantFor()} className="px-2.5">
            <span className="text-[13px] leading-none">{getEmoji()}</span>
            <span>{getLabel()}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <p>
              <strong>Confiança:</strong>{' '}
              {sentiment.confidence_score
                ? `${Math.round(sentiment.confidence_score * 100)}%`
                : 'N/A'}
            </p>
            <p>
              <strong>Mensagens analisadas:</strong>{' '}
              {sentiment.messages_analyzed || 0}
            </p>
            <p>
              <strong>Última análise:</strong> {lastAnalysis}
            </p>
            {sentiment.summary && (
              <p className="max-w-xs pt-1 border-t">
                {sentiment.summary}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
