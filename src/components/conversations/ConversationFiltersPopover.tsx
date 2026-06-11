import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings2 } from 'lucide-react';
import { InstanceFilter } from './InstanceFilter';

interface ConversationFiltersPopoverProps {
  statusFilter: string;
  onStatusChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  instanceFilter: string | null;
  onInstanceChange: (value: string | null) => void;
}

export function ConversationFiltersPopover({
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  instanceFilter,
  onInstanceChange,
}: ConversationFiltersPopoverProps) {
  // Conta quantos filtros estão ativos (diferentes do padrão)
  const activeFiltersCount = [
    statusFilter !== 'all',
    sortBy !== 'recent',
    instanceFilter !== null,
  ].filter(Boolean).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-[30px] px-3 bg-bg-surface border-subtle text-text-primary hover:bg-bg-surface-2 text-[12.5px] font-medium rounded-pill"
        >
          <Settings2 className="h-3.5 w-3.5 mr-1.5" />
          Filtros
          {activeFiltersCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-accent text-white text-[10.5px] font-semibold tabular">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-1">Filtros Avançados</h4>
            <p className="text-xs text-muted-foreground">
              Refine sua busca com filtros adicionais
            </p>
          </div>

          {/* Ordenação */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ordenação</label>
            <Select value={sortBy} onValueChange={onSortChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">🕐 Mais Recentes</SelectItem>
                <SelectItem value="unread">🔔 Não Lidas Primeiro</SelectItem>
                <SelectItem value="waiting">⏳ Aguardando Resposta</SelectItem>
                <SelectItem value="oldest">📅 Mais Antigas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Em Aberto</SelectItem>
                <SelectItem value="closed">Encerradas</SelectItem>
                <SelectItem value="archived">Arquivadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Instância */}
          <InstanceFilter
            selectedInstance={instanceFilter}
            onInstanceChange={onInstanceChange}
          />

          {/* Botão limpar filtros */}
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onStatusChange('all');
                onSortChange('recent');
                onInstanceChange(null);
              }}
            >
              Limpar Filtros
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
