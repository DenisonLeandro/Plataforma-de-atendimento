import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAiUsageDashboard, type AiFeature } from '@/hooks/useAiUsageDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { BarChart3, Building2, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CompanyOption {
  id: string;
  name: string;
}

interface AiCostDashboardProps {
  companies: CompanyOption[];
}

/** Ordem de exibição e rótulos amigáveis das features. */
const FEATURES: { key: AiFeature; label: string; short: string }[] = [
  { key: 'transcription', label: '🎤 Transcrição de Áudio', short: 'Transcrição' },
  { key: 'sentiment', label: '💬 Análise de Sentimento', short: 'Sentimento' },
  { key: 'categorization', label: '🏷️ Categorização', short: 'Categoriz.' },
  { key: 'summary', label: '📝 Resumo de Conversa', short: 'Resumos' },
  { key: 'smart_replies', label: '⚡ Sugestões de Resposta', short: 'Sugestões' },
  { key: 'composer', label: '✍️ Compositor IA', short: 'Compositor' },
];

type Preset = '7d' | '30d' | 'month' | 'custom';

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

/** Converte 'YYYY-MM-DD' para o início/fim daquele dia no fuso local. */
function dayBoundary(isoDay: string, edge: 'start' | 'end'): Date {
  const [y, m, d] = isoDay.split('-').map(Number);
  return edge === 'start'
    ? new Date(y, m - 1, d, 0, 0, 0, 0)
    : new Date(y, m - 1, d, 23, 59, 59, 999);
}

function toInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function AiCostDashboard({ companies }: AiCostDashboardProps) {
  // Custos de IA são exclusivos do super_admin. O guard fica DEPOIS dos hooks
  // (ver return null abaixo): isSuperAdmin começa false e vira true quando a
  // RPC do AuthContext resolve, então um early-return aqui mudaria a contagem
  // de hooks entre renders.
  const { isSuperAdmin } = useAuth();

  const [preset, setPreset] = useState<Preset>('30d');
  const [customStart, setCustomStart] = useState(() => toInputValue(new Date(Date.now() - 30 * 864e5)));
  const [customEnd, setCustomEnd] = useState(() => toInputValue(new Date()));

  // null = todas as empresas
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case '7d':
        return { startDate: new Date(now.getTime() - 7 * 864e5), endDate: now };
      case 'month':
        return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: now };
      case 'custom':
        return { startDate: dayBoundary(customStart, 'start'), endDate: dayBoundary(customEnd, 'end') };
      case '30d':
      default:
        return { startDate: new Date(now.getTime() - 30 * 864e5), endDate: now };
    }
  }, [preset, customStart, customEnd]);

  const { data, isLoading, isFetching, error, refetch } = useAiUsageDashboard({
    companyIds: selectedIds,
    startDate,
    endDate,
    enabled: isSuperAdmin,
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success('Dados atualizados');
    } catch (err) {
      toast.error('Erro ao atualizar dados');
    }
  };

  // Totais por feature (todas as empresas do resultado)
  const byFeature = useMemo(() => {
    const acc = new Map<AiFeature, { calls: number; cost: number }>();
    for (const { key } of FEATURES) acc.set(key, { calls: 0, cost: 0 });
    for (const row of data) {
      const entry = acc.get(row.feature);
      if (!entry) continue;
      entry.calls += row.total_calls;
      entry.cost += row.total_cost_brl;
    }
    return acc;
  }, [data]);

  const grandTotal = useMemo(
    () =>
      data.reduce(
        (acc, row) => ({
          calls: acc.calls + row.total_calls,
          cost: acc.cost + row.total_cost_brl,
        }),
        { calls: 0, cost: 0 }
      ),
    [data]
  );

  // Uma linha por empresa, com uma coluna por feature
  const rowsByCompany = useMemo(() => {
    const map = new Map<string, { name: string; features: Record<string, number>; total: number }>();
    for (const row of data) {
      let entry = map.get(row.company_id);
      if (!entry) {
        entry = { name: row.company_name, features: {}, total: 0 };
        map.set(row.company_id, entry);
      }
      entry.features[row.feature] = (entry.features[row.feature] ?? 0) + row.total_cost_brl;
      entry.total += row.total_cost_brl;
    }
    return [...map.entries()]
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const toggleCompany = (id: string) => {
    setSelectedIds((current) => {
      const base = current ?? companies.map((c) => c.id);
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      // Nenhuma ou todas selecionadas => volta para "Todas"
      return next.length === 0 || next.length === companies.length ? null : next;
    });
  };

  const selectionLabel =
    selectedIds === null
      ? 'Todas as empresas'
      : selectedIds.length === 1
        ? (companies.find((c) => c.id === selectedIds[0])?.name ?? '1 empresa')
        : `${selectedIds.length} empresas`;

  // Defesa em profundidade: mesmo que o componente seja montado fora da rota
  // /super-admin, não renderiza nada para quem não é super_admin.
  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6">
      <Separator />

      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Dashboard de Custos de IA
        </h2>
        <p className="text-muted-foreground text-sm">
          Consumo estimado das features de IA por empresa. Atualiza automaticamente.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <div className="flex flex-wrap gap-2">
            {([
              ['7d', '7 dias'],
              ['30d', '30 dias'],
              ['month', 'Este mês'],
              ['custom', 'Personalizado'],
            ] as [Preset, string][]).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={preset === value ? 'default' : 'outline'}
                onClick={() => setPreset(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex gap-2">
            <div className="space-y-2">
              <Label htmlFor="ai-cost-start" className="text-xs text-muted-foreground">De</Label>
              <Input
                id="ai-cost-start"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-cost-end" className="text-xs text-muted-foreground">Até</Label>
              <Input
                id="ai-cost-end"
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-auto"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Empresas</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-between min-w-[200px]">
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{selectionLabel}</span>
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="max-h-72 overflow-y-auto space-y-1">
                <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm font-medium">
                  <Checkbox
                    checked={selectedIds === null}
                    onCheckedChange={() => setSelectedIds(null)}
                  />
                  Todas
                </label>
                <Separator className="my-1" />
                {companies.map((company) => (
                  <label
                    key={company.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedIds === null || selectedIds.includes(company.id)}
                      onCheckedChange={() => toggleCompany(company.id)}
                    />
                    <span className="truncate">{company.name}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-sm text-destructive">
            Erro ao carregar custos de IA: {(error as Error).message}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Carregando custos de IA...
        </div>
      ) : (
        <>
          {/* Cards de totais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Geral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5">
                <div className="text-2xl font-bold">{brl(grandTotal.cost)}</div>
                <div className="text-xs text-muted-foreground">
                  {grandTotal.calls.toLocaleString('pt-BR')} chamadas
                </div>
              </CardContent>
            </Card>

            {FEATURES.map(({ key, label }) => {
              const entry = byFeature.get(key)!;
              return (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0.5">
                    <div className="text-2xl font-bold">{brl(entry.cost)}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.calls.toLocaleString('pt-BR')} chamadas
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Tabela por empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento por empresa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      {FEATURES.map(({ key, short }) => (
                        <TableHead key={key} className="text-right whitespace-nowrap">
                          {short}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold">TOTAL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsByCompany.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={FEATURES.length + 2}
                          className="text-center text-muted-foreground py-8"
                        >
                          Nenhum uso de IA registrado no período selecionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rowsByCompany.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          {FEATURES.map(({ key }) => (
                            <TableCell key={key} className="text-right tabular-nums">
                              {brl(row.features[key] ?? 0)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold tabular-nums">
                            {brl(row.total)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
