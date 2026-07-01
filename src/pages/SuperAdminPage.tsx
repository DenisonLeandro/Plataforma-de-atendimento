import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, ArrowLeft, Loader2, Copy, Check, Users, Info, ShieldAlert, Ban, CheckCircle } from 'lucide-react';

interface CompanyEnriched {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'suspended';
  created_at: string;
  userCount: number;
  instanceCount: number;
}

export default function SuperAdminPage() {
  const { setViewAsCompany } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [createdCompanyCode, setCreatedCompanyCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);

  // Admin Modal States
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyEnriched | null>(null);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  // Alert Dialog States (Suspend/Activate)
  const [statusTarget, setStatusTarget] = useState<CompanyEnriched | null>(null);
  const [isStatusChanging, setIsStatusChanging] = useState(false);

  // Fetch Companies & Counts
  const { data: companies = [], isLoading, refetch } = useQuery<CompanyEnriched[]>({
    queryKey: ['super-admin', 'companies'],
    queryFn: async () => {
      const { data: cos, error } = await supabase
        .from('companies' as any)
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Erro ao buscar empresas',
          description: error.message,
        });
        throw error;
      }
      if (!cos) return [];

      const enriched = await Promise.all(
        cos.map(async (company: any) => {
          const { count: userCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id);

          const { count: instanceCount } = await supabase
            .from('whatsapp_instances')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id);

          return {
            ...company,
            userCount: userCount || 0,
            instanceCount: instanceCount || 0,
          } as CompanyEnriched;
        })
      );

      return enriched;
    },
  });

  // Handle Copy Code
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    toast({
      title: 'Código copiado!',
      description: 'Código da empresa copiado para a área de transferência.',
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Handle Create Company
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setIsCreatingCompany(true);
    try {
      // 1. Generate code via RPC
      const { data: code, error: codeErr } = await (supabase.rpc as any)('generate_company_code');
      if (codeErr) throw codeErr;

      // 2. Insert company
      const { data: newCompany, error: insertErr } = await (supabase.from as any)('companies')
        .insert({
          name: companyName.trim(),
          code: code,
          status: 'active',
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setCreatedCompanyCode(code);
      toast({
        title: 'Empresa criada com sucesso!',
        description: `Código gerado: ${code}`,
      });
      refetch();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar empresa',
        description: error.message,
      });
    } finally {
      setIsCreatingCompany(false);
    }
  };

  // Handle Create Admin
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) return;

    setIsCreatingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-company-admin', {
        body: {
          company_id: selectedCompany.id,
          name: adminName.trim(),
          email: adminEmail.trim(),
          password: adminPassword,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Administrador criado!',
        description: `Administrador para a empresa ${selectedCompany.name} criado com sucesso.`,
      });
      setIsAdminOpen(false);
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      refetch();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar administrador',
        description: error.message || 'Erro inesperado.',
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  // Handle Toggle Status
  const handleToggleStatus = async () => {
    if (!statusTarget) return;

    setIsStatusChanging(true);
    const newStatus = statusTarget.status === 'active' ? 'suspended' : 'active';
    try {
      const { error } = await (supabase.from as any)('companies')
        .update({ status: newStatus })
        .eq('id', statusTarget.id);

      if (error) throw error;

      toast({
        title: newStatus === 'active' ? 'Empresa ativada!' : 'Empresa suspensa!',
        description: `A empresa ${statusTarget.name} foi ${newStatus === 'active' ? 'ativada' : 'suspensa'}.`,
      });
      setStatusTarget(null);
      refetch();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar status',
        description: error.message,
      });
    } finally {
      setIsStatusChanging(false);
    }
  };

  // Handle Enter As Mode
  const handleEnterAs = (company: CompanyEnriched) => {
    setViewAsCompany(company.id);
    toast({
      title: 'Modo visualização ativado',
      description: `Entrando no contexto da empresa: ${company.name}`,
    });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar à Plataforma
            </Button>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-8 w-8 text-primary" />
              Painel de Empresas (Super Admin)
            </h1>
            <p className="text-muted-foreground">
              Gerenciamento global de inquilinos e instâncias multi-tenant
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setCompanyName('');
              setCreatedCompanyCode(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button className="w-full md:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
                <DialogDescription>
                  Adicione uma empresa à plataforma. O sistema gerará um código único de cadastro.
                </DialogDescription>
              </DialogHeader>

              {!createdCompanyCode ? (
                <form onSubmit={handleCreateCompany} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome da Empresa</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Denison Leandro Advocacia"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={isCreatingCompany}
                      required
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isCreatingCompany || !companyName.trim()}>
                      {isCreatingCompany ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Criando...
                        </>
                      ) : (
                        'Criar Empresa'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                <div className="space-y-6 py-4 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Empresa Criada!</h3>
                    <p className="text-sm text-muted-foreground">
                      Forneça o código abaixo para que os funcionários possam se cadastrar.
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg flex items-center justify-between border">
                    <code className="text-xl font-bold text-foreground tracking-wider uppercase">
                      {createdCompanyCode}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopyCode(createdCompanyCode)}
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button className="w-full">Fechar</Button>
                    </DialogClose>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Content list */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando lista de empresas...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((company) => (
              <Card key={company.id} className="flex flex-col justify-between border-border/50 shadow-md">
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-xl truncate" title={company.name}>
                      {company.name}
                    </CardTitle>
                    <Badge variant={company.status === 'active' ? 'default' : 'destructive'}>
                      {company.status === 'active' ? 'Ativa' : 'Suspensa'}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-1.5 mt-1 font-mono text-xs">
                    Código: <span className="font-bold text-foreground uppercase">{company.code}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-3 rounded-lg border">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">Usuários</span>
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {company.userCount}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block">Instâncias</span>
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {company.instanceCount}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Criada em: {new Date(company.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </div>
                </CardContent>

                <div className="p-6 pt-0 flex flex-col gap-2 border-t mt-auto">
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => handleEnterAs(company)}
                      disabled={company.status !== 'active'}
                    >
                      Entrar como
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setSelectedCompany(company);
                        setIsAdminOpen(true);
                      }}
                      disabled={company.status !== 'active'}
                    >
                      Criar Admin
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`w-full text-xs font-semibold ${
                      company.status === 'active' 
                        ? 'text-destructive hover:bg-destructive/10' 
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    onClick={() => setStatusTarget(company)}
                  >
                    {company.status === 'active' ? (
                      <>
                        <Ban className="mr-1 h-3.5 w-3.5" /> Suspender
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-1 h-3.5 w-3.5" /> Ativar
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Modal for Creating Admin */}
        <Dialog open={isAdminOpen} onOpenChange={(open) => {
          setIsAdminOpen(open);
          if (!open) {
            setSelectedCompany(null);
            setAdminName('');
            setAdminEmail('');
            setAdminPassword('');
          }
        }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Criar Administrador Inicial</DialogTitle>
              <DialogDescription>
                Adicione o usuário administrador inicial para a empresa{' '}
                <strong className="text-foreground">{selectedCompany?.name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateAdmin} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="adminName">Nome Completo</Label>
                <Input
                  id="adminName"
                  placeholder="Nome do Admin"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  disabled={isCreatingAdmin}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail">Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@email.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  disabled={isCreatingAdmin}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPassword">Senha Inicial</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  placeholder="Senha temporária"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  disabled={isCreatingAdmin}
                  required
                />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isCreatingAdmin}>
                  {isCreatingAdmin ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando Admin...
                    </>
                  ) : (
                    'Criar Admin'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* AlertDialog for Suspend/Activate Confirmation */}
        <AlertDialog open={!!statusTarget} onOpenChange={(open) => { if (!open) setStatusTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {statusTarget?.status === 'active' 
                  ? `Deseja suspender a empresa ${statusTarget?.name}?` 
                  : `Deseja ativar a empresa ${statusTarget?.name}?`
                }
              </AlertDialogTitle>
              <AlertDialogDescription>
                {statusTarget?.status === 'active'
                  ? 'Isso impedirá que todos os usuários dessa empresa acessem a plataforma e desativará os recursos temporariamente.'
                  : 'Isso restaurará o acesso à plataforma para todos os usuários associados a esta empresa.'
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isStatusChanging}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleStatus();
                }}
                disabled={isStatusChanging}
                className={statusTarget?.status === 'active' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/95'}
              >
                {isStatusChanging ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  statusTarget?.status === 'active' ? 'Suspender' : 'Ativar'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
