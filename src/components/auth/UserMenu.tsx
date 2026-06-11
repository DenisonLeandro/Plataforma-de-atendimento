import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LogOut, User as UserIcon, Circle } from 'lucide-react';
import { ProfileModal } from './ProfileModal';

const statusColors = {
  online: 'bg-emerald-500',
  offline: 'bg-gray-400',
  away: 'bg-amber-400',
  busy: 'bg-red-500',
};

const roleLabels = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Atendente',
};

export function UserMenu() {
  const { profile, role, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();

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
        <button className="flex items-center gap-3 w-full bg-bg-nav-deep hover:bg-bg-nav-elevated rounded-md p-2.5 text-left transition-colors">
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-bg-nav-deep">
              <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
              <AvatarFallback className="bg-brand text-text-on-dark font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${statusColors[profile.status]} rounded-full ring-2 ring-bg-nav-deep`}
            />
          </div>
          <div className="flex flex-col items-start text-left min-w-0 flex-1">
            <span className="text-[14px] font-medium text-text-on-dark truncate w-full">{profile.full_name}</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-on-dark-soft">
              {roleLabels[role]}
            </span>
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
        
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>

      <ProfileModal open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </DropdownMenu>
  );
}
