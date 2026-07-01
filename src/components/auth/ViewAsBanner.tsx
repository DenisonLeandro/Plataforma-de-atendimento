import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { Button } from '@/components/ui/button';
import { Eye, LogOut, Loader2 } from 'lucide-react';

export function ViewAsBanner() {
  const { isViewingAsCompany, setViewAsCompany } = useAuth();
  const { companyName, isLoading } = useCompanyContext();
  const navigate = useNavigate();

  if (!isViewingAsCompany) return null;

  const handleExit = () => {
    setViewAsCompany(null);
    navigate('/super-admin');
  };

  return (
    <div className="w-full bg-amber-500 text-amber-950 font-medium px-4 py-2 flex items-center justify-between border-b border-amber-600 shadow-md relative z-[100] animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2 text-sm sm:text-base">
        <Eye className="h-5 w-5 animate-pulse text-amber-950" />
        <span>
          Visualizando como:{' '}
          <strong className="font-bold underline">
            {isLoading ? 'Carregando...' : companyName}
          </strong>{' '}
          — <span className="text-xs uppercase bg-amber-900 text-amber-100 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">Modo somente leitura</span>
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleExit}
        className="text-amber-950 hover:bg-amber-600/30 font-semibold gap-1.5 text-xs h-8 border border-amber-900/30"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair do modo visualização
      </Button>
    </div>
  );
}
