import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LogOut, User as UserIcon, Circle, Building2, Sun, Moon, Monitor } from 'lucide-react';
import { ProfileModal } from './ProfileModal';
import { useSignedUrl } from '@/utils/signedUrl';

const statusColors = {
  online: 'bg-green-500',
  offline: 'bg-gray-500',
  away: 'bg-yellow-500',
  busy: 'bg-red-500',
};

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Atendente',
  super_admin: 'Super Admin',
};

export function UserMenu() {
  const { profile, role, signOut, isSuperAdmin } = useAuth();
  const { companyName } = useCompanyContext();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();
  const signedAvatar = useSignedUrl(profile?.avatar_url ?? null);
  // next-themes guarda a escolha no navegador, igual a preferencia de som das
  // notificacoes. 'system' acompanha o tema do sistema operacional.
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!profile || !role) {
    return null;
  }

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 hover:bg-accent/50 rounded-lg p-2 transition-colors">
          <div className="relative">
            <Avatar className="h-10 w-10 border-2 border-border">
              <AvatarImage src={signedAvatar} alt={profile.full_name} />
              <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <Circle 
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 ${statusColors[profile.status]} border-2 border-background rounded-full`}
              fill="currentColor"
            />
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="text-sm font-medium text-foreground">{profile.full_name}</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {roleLabels[role]}
            </Badge>
            {companyName && (
              <span className="text-xs text-muted-foreground mt-0.5">{companyName}</span>
            )}
          </div>
        </button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
          <UserIcon className="mr-2 h-4 w-4" />
          <span>Perfil</span>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />

        {isSuperAdmin && (
          <>
            <DropdownMenuItem onClick={() => navigate('/super-admin')}>
              <Building2 className="mr-2 h-4 w-4" />
              <span>Painel de Empresas</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Tema
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" />
            <span>Claro</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" />
            <span>Escuro</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="mr-2 h-4 w-4" />
            <span>Automático</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>

      <ProfileModal open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </DropdownMenu>
  );
}
