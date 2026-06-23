import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, KeyRound, Trash2 } from 'lucide-react';
import { useSignedUrl } from '@/utils/signedUrl';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusOptions = [
  { value: 'online', label: '🟢 Online', description: 'Disponível para atendimento' },
  { value: 'away', label: '🟡 Ausente', description: 'Temporariamente indisponível' },
  { value: 'busy', label: '🔴 Ocupado', description: 'Em atendimento' },
  { value: 'offline', label: '⚫ Offline', description: 'Desconectado' },
];

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const { updateProfile, uploadAvatar } = useUpdateProfile(user?.id || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [status, setStatus] = useState<'online' | 'offline' | 'away' | 'busy'>(
    (profile?.status as 'online' | 'offline' | 'away' | 'busy') || 'online'
  );
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [isUploading, setIsUploading] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadAvatar.mutateAsync(file);
      setAvatarUrl(url);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    await updateProfile.mutateAsync({
      full_name: fullName,
      status: status,
      avatar_url: avatarUrl,
    });

    await refreshProfile();
    onOpenChange(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 8 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Senhas não coincidem',
        description: 'A confirmação deve ser igual à nova senha.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsChangingPassword(false);

    if (error) {
      toast({
        title: 'Erro ao alterar senha',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    toast({
      title: 'Senha alterada',
      description: 'Sua senha foi atualizada com sucesso.',
    });
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user-account');
      if (error || (data && (data as any).error)) {
        const msg = (data as any)?.error || error?.message || 'Erro ao excluir conta';
        toast({
          title: 'Não foi possível excluir',
          description: msg,
          variant: 'destructive',
        });
        setIsDeleting(false);
        return;
      }
      toast({
        title: 'Conta excluída',
        description: 'Sua conta foi removida com sucesso.',
      });
      await signOut();
      navigate('/auth');
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: e?.message || 'Falha ao excluir conta',
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
          <DialogDescription>
            Atualize suas informações pessoais e status de disponibilidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar Section */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={avatarUrl || undefined} alt={fullName} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    Alterar Foto
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG ou WEBP (máx. 5MB)
              </p>
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome Completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>

          {/* Email (Read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={user?.email || ''}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              O email não pode ser alterado
            </p>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(value: any) => setStatus(value)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending || !fullName.trim()}
          >
            {updateProfile.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </div>

        <Separator className="my-6" />

        {/* Change Password */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Alterar senha</h3>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">Nova senha</Label>
            <Input
              id="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirmar nova senha</Label>
            <Input
              id="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleChangePassword}
            disabled={isChangingPassword || !newPassword || !confirmPassword}
            className="w-full"
          >
            {isChangingPassword ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Alterando...
              </>
            ) : (
              'Alterar senha'
            )}
          </Button>
        </div>

        <Separator className="my-6" />

        {/* Danger Zone */}
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Zona de perigo</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Excluir sua conta é permanente. Todos os seus dados pessoais serão
            removidos e você perderá acesso ao sistema.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setDeleteConfirmText('');
              setShowDeleteDialog(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Excluir minha conta
          </Button>
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conta permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Essa ação não pode ser desfeita. Para confirmar, digite{' '}
                <strong>EXCLUIR</strong> abaixo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Digite EXCLUIR"
              autoFocus
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteAccount();
                }}
                disabled={deleteConfirmText !== 'EXCLUIR' || isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  'Excluir conta'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
