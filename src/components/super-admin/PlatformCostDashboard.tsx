import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAiUsageDashboard } from '@/hooks/useAiUsageDashboard';
import { usePlatformFixedCosts } from '@/hooks/usePlatformFixedCosts';
import { PlatformFixedCostsEditor } from './PlatformFixedCostsEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, Building2, Sparkles, Divide, ArrowRight, Loader2 } from 'lucide-react';

interface CompanyOption {
  id: string;
  name: string;
  status: 'active' | 'suspended';
}

interface PlatformCostDashboardProps {
  companies: CompanyOption[];
}

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

/** 'YYYY-MM' do mês atual, no fuso local. */
function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Início e fim (inclusivo) do mês 'YYYY-MM' no fuso local. */
function monthRange(monthValue: string): { start: Date; end: Date } {
  const [y, m] = monthValue.split('-').map(Number);
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end: new Date(y, m, 0, 23, 59, 59, 999), // dia 0 do mês seguinte = último dia deste mês
  };
}

export function PlatformCostDashboard({ companies }: PlatformCostDashboardProps) {
  // Exclusivo do super_admin. Guard DEPOIS dos hooks (contagem de hooks estável).
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [month, setMonth] = useState<string>(currentMonthValue());
  const { start, end } = useMemo(() => monthRange(month), [month]);

  const { costs, isLoading: loadingCosts } = usePlatformFixedCosts(isSuperAdmin);
  const { data: aiRows, isLoading: loadingAi } = useAiUsageDashboard({
    companyIds: null, // todas as empresas
    startDate: start,
    endDate: end,
    enabled: isSuperAdmin,
  });

  const activeCompanies = useMemo(
    () => companies.filter((c) => c.status === 'active'),
    [companies]
  );
  const activeCount = activeCompanies.length;

  // Custos fixos ativos
  const totalFixed = useMemo(
    () => costs.filter((c) => c.active).reduce((acc, c) => acc + c.amount_brl, 0),
    [costs]
  );
  const fixedPerCompany = activeCount > 0 ? totalFixed / activeCount : 0;

  // Custo de IA próprio por empresa (soma de todas as features no mês)
  const aiByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of aiRows) {
      map.set(row.company_id, (map.get(row.company_id) ?? 0) + row.total_cost_brl);
    }
    return map;
  }, [aiRows]);

  const totalAi = useMemo(
    () => Array.from(aiByCompany.values()).reduce((acc, v) => acc + v, 0),
    [aiByCompany]
  );

  const platformTotal = totalFixed + totalAi;

  // Uma linha por empresa ativa: IA própria + rateio fixo = total
  const rows = useMemo(() => {
    return activeCompanies
      .map((c) => {
        const aiCost = aiByCompany.get(c.id) ?? 0;
        return {
          id: c.id,
          name: c.name,
          aiCost,
          fixedShare: fixedPerCompany,
          total: aiCost + fixedPerCompany,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [activeCompanies, aiByCompany, fixedPerCompany]);

  const loading = loadingCosts || loadingAi;

  // Defesa em profundidade: nada renderiza para não-super_admin.
  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6">
      <Separator />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Custos da Plataforma
          </h2>
          <p className="text-muted-foreground text-sm">
            Custos fixos rateados pelas empresas ativas + custo de IA próprio de cada empresa.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="cost-month" className="text-xs text-muted-foreground">Mês</Label>
            <Input
              id="cost-month"
              type="month"
              value={month}
              max={currentMonthValue()}
              onChange={(e) => setMonth(e.target.value || currentMonthValue())}
              className="w-auto"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/super-admin/ia')}>
            <Sparkles className="mr-2 h-4 w-4" />
            Ver dashboard de IA
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Carregando custos...
        </div>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Geral</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{brl(platformTotal)}</div>
                <div className="text-xs text-muted-foreground">Fixos + IA no mês</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-muted-foreground" /> Custos Fixos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{brl(totalFixed)}</div>
                <div className="text-xs text-muted-foreground">Compartilhados</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-muted-foreground" /> Custo de IA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{brl(totalAi)}</div>
                <div className="text-xs text-muted-foreground">Próprio das empresas</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Divide className="h-4 w-4 text-muted-foreground" /> Rateio / empresa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{brl(fixedPerCompany)}</div>
                <div className="text-xs text-muted-foreground">Só custos fixos</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" /> Empresas ativas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeCount}</div>
                <div className="text-xs text-muted-foreground">Divisor do rateio</div>
              </CardContent>
            </Card>
          </div>

          {/* Fórmula ao vivo */}
          <Card className="bg-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Como o rateio é calculado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">Rateio por empresa =</span>
                <span className="font-medium">{brl(totalFixed)}</span>
                <span className="text-muted-foreground">(custos fixos)</span>
                <span>÷</span>
                <span className="font-medium">{activeCount}</span>
                <span className="text-muted-foreground">
                  {activeCount === 1 ? 'empresa ativa' : 'empresas ativas'}
                </span>
                <span>=</span>
                <span className="font-bold text-foreground">{brl(fixedPerCompany)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">Total de cada empresa =</span>
                <span className="font-medium">{brl(fixedPerCompany)}</span>
                <span className="text-muted-foreground">(rateio fixo)</span>
                <span>+</span>
                <span className="text-muted-foreground">IA própria da empresa no mês</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                O divisor acompanha automaticamente o número de empresas ativas: se uma empresa
                sai ou é suspensa, o rateio se divide entre as restantes; se entra uma nova, entre todas.
                {activeCount === 0 && ' (Sem empresas ativas, o rateio fica em R$ 0,00.)'}
              </p>
            </CardContent>
          </Card>

          {/* Tabela por empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Custo por empresa (mês selecionado)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead className="text-right whitespace-nowrap">IA (própria)</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Rateio fixo</TableHead>
                      <TableHead className="text-right font-bold">TOTAL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhuma empresa ativa no momento.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{brl(row.aiCost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{brl(row.fixedShare)}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums">{brl(row.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Editor de custos fixos */}
          <PlatformFixedCostsEditor />
        </>
      )}
    </div>
  );
}
