import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { Button } from '@/components/ui/button';
import { Eye, LogOut, ShieldCheck } from 'lucide-react';

export function ViewAsBanner() {
  const { isViewingAsCompany, setViewAsCompany, canWriteViewedCompany } = useAuth();
  const { companyName, isLoading } = useCompanyContext();
  const navigate = useNavigate();

  if (!isViewingAsCompany) return null;

  const handleExit = () => {
    setViewAsCompany(null);
    navigate('/super-admin');
  };

  const wrapperClass = canWriteViewedCompany
    ? 'w-full bg-emerald-500 text-emerald-950 border-b border-emerald-600'
    : 'w-full bg-amber-500 text-amber-950 border-b border-amber-600';

  const badgeClass = canWriteViewedCompany
    ? 'text-xs uppercase bg-emerald-900 text-emerald-100 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider'
    : 'text-xs uppercase bg-amber-900 text-amber-100 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider';

  const buttonClass = canWriteViewedCompany
    ? 'text-emerald-950 hover:bg-emerald-600/30 font-semibold gap-1.5 text-xs h-8 border border-emerald-900/30'
    : 'text-amber-950 hover:bg-amber-600/30 font-semibold gap-1.5 text-xs h-8 border border-amber-900/30';

  return (
    <div className={`${wrapperClass} font-medium px-4 py-2 flex items-center justify-between shadow-md relative z-[100] animate-in slide-in-from-top duration-300`}>
      <div className="flex items-center gap-2 text-sm sm:text-base">
        {canWriteViewedCompany ? (
          <ShieldCheck className="h-5 w-5" />
        ) : (
          <Eye className="h-5 w-5 animate-pulse" />
        )}
        <span>
          {canWriteViewedCompany ? 'Atuando como admin em: ' : 'Visualizando como: '}
          <strong className="font-bold underline">
            {isLoading ? 'Carregando...' : companyName}
          </strong>{' '}
          — <span className={badgeClass}>
            {canWriteViewedCompany ? 'Acesso total' : 'Modo somente leitura'}
          </span>
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleExit}
        className={buttonClass}
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair do modo visualização
      </Button>
    </div>
  );
}
