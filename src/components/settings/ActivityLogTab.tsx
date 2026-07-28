import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityLog, type ActivityLogRow } from '@/hooks/useActivityLog';
import { useSuperAdminCompanies } from '@/hooks/useSuperAdminCompanies';
import { activityLabel, ACTIVITY_GROUPS } from '@/lib/activity-log';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Building2, ChevronDown, Loader2, RefreshCw, History, Filter } from 'lucide-react';

type Preset = '24h' | '7d' | '30d';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Atendente',
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ActivityLogTab() {
  const { isSuperAdmin, isAdmin } = useAuth();

  const [preset, setPreset] = useState<Preset>('7d');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]); // vazio = todos
  const [selectedCompanies, setSelectedCompanies] = useState<string[] | null>(null); // null = todas
  const [search, setSearch] = useState('');

  const { companies } = useSuperAdminCompanies(isSuperAdmin);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const ms = preset === '24h' ? 864e5 : preset === '7d' ? 7 * 864e5 : 30 * 864e5;
    return { startDate: new Date(now.getTime() - ms), endDate: now };
  }, [preset]);

  // Ações selecionadas: expande os grupos escolhidos em actions concretas
  const actions = useMemo(() => {
    if (selectedGroups.length === 0) return null;
    return ACTIVITY_GROUPS.filter((g) => selectedGroups.includes(g.label)).flatMap((g) => g.actions);
  }, [selectedGroups]);

  const { data, isLoading, isFetching, refetch } = useActivityLog({
    companyIds: isSuperAdmin ? selectedCompanies : null,
    actions,
    startDate,
    endDate,
    limit: 500,
    enabled: isAdmin,
  });

  // Busca textual no cliente (ator / alvo)
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (r) =>
        (r.actor_name ?? '').toLowerCase().includes(q) ||
        (r.target_label ?? '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const toggleGroup = (label: string) => {
    setSelectedGroups((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]));
  };

  const toggleCompany = (id: string) => {
    setSelectedCompanies((cur) => {
      const base = cur ?? companies.map((c) => c.id);
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      return next.length === 0 || next.length === companies.length ? null : next;
    });
  };

  const groupsLabel = selectedGroups.length === 0 ? 'Todas as ações' : `${selectedGroups.length} tipo(s)`;
  const companiesLabel =
    selectedCompanies === null
      ? 'Todas as empresas'
      : selectedCompanies.length === 1
        ? (companies.find((c) => c.id === selectedCompanies[0])?.name ?? '1 empresa')
        : `${selectedCompanies.length} empresas`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Atividades dos usuários
        </h2>
        <p className="text-muted-foreground text-sm">
          {isSuperAdmin
            ? 'Histórico de ações de todas as empresas. Atualiza automaticamente.'
            : 'Histórico de ações da sua empresa. Atualiza automaticamente.'}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <div className="flex flex-wrap gap-2">
            {([['24h', '24 horas'], ['7d', '7 dias'], ['30d', '30 dias']] as [Preset, string][]).map(
              ([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={preset === value ? 'default' : 'outline'}
                  onClick={() => setPreset(value)}
                >
                  {label}
                </Button>
              )
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tipo de ação</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-between min-w-[170px]">
                <span className="flex items-center gap-2 truncate">
                  <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{groupsLabel}</span>
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {ACTIVITY_GROUPS.map((g) => (
                  <label
                    key={g.label}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <Checkbox checked={selectedGroups.includes(g.label)} onCheckedChange={() => toggleGroup(g.label)} />
                    {g.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {isSuperAdmin && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Empresas</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between min-w-[180px]">
                  <span className="flex items-center gap-2 truncate">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{companiesLabel}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-72 overflow-y-auto space-y-1">
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm font-medium">
                    <Checkbox checked={selectedCompanies === null} onCheckedChange={() => setSelectedCompanies(null)} />
                    Todas
                  </label>
                  <Separator className="my-1" />
                  {companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selectedCompanies === null || selectedCompanies.includes(company.id)}
                        onCheckedChange={() => toggleCompany(company.id)}
                      />
                      <span className="truncate">{company.name}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="space-y-2 flex-1 min-w-[160px]">
          <Label htmlFor="activity-search" className="text-xs text-muted-foreground">Buscar (usuário / alvo)</Label>
          <Input
            id="activity-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex.: nome do atendente ou contato"
            className="h-9"
          />
        </div>

        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading ? 'Carregando...' : `${rows.length} ação(ões) no período`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Carregando atividades...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Quando</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Alvo</TableHead>
                    {isSuperAdmin && <TableHead>Empresa</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isSuperAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">
                        Nenhuma atividade registrada no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row: ActivityLogRow) => {
                      const meta = activityLabel(row.action);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
                            {relativeTime(row.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{row.actor_name ?? 'Sistema'}</span>
                              {row.actor_role && (
                                <span className="text-xs text-muted-foreground">
                                  {ROLE_LABELS[row.actor_role] ?? row.actor_role}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden>{meta.icon}</span>
                              {meta.label}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate" title={row.target_label ?? ''}>
                            {row.target_label || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              {row.company_name ? (
                                <Badge variant="outline" className="font-normal">{row.company_name}</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
