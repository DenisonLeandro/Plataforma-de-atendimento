import { useNavigate } from 'react-router-dom';
import { useSuperAdminCompanies } from '@/hooks/useSuperAdminCompanies';
import { AiCostDashboard } from '@/components/super-admin/AiCostDashboard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function SuperAdminAiPage() {
  const navigate = useNavigate();
  const { companies } = useSuperAdminCompanies();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-8 space-y-6">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/super-admin')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar aos Custos da Plataforma
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            Dashboard de Custos de IA
          </h1>
          <p className="text-muted-foreground">
            Detalhamento do consumo de IA por empresa e por feature.
          </p>
        </div>

        <AiCostDashboard companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    </div>
  );
}
