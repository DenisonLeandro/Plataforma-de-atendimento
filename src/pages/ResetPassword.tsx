import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { translateAuthError } from '@/utils/authErrorMessages';

/**
 * Tela final do "Esqueci minha senha": a pessoa chega aqui pelo link do e-mail,
 * já com sessão criada pelo Supabase, e define a nova senha.
 *
 * Enquanto `isPasswordRecovery` estiver ligado, o ProtectedRoute empurra
 * qualquer outra rota de volta para cá — sem isso a pessoa entraria no app com
 * o link consumido e a senha antiga ainda valendo.
 */
const MIN_LENGTH = 6;

export default function ResetPassword() {
  const { user, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sem sessão nenhuma, a pessoa abriu o endereço direto ou o link expirou.
  const linkInvalido = !user && !isPasswordRecovery;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < MIN_LENGTH) {
      toast({
        variant: 'destructive',
        title: 'Senha muito curta',
        description: `A senha deve ter no mínimo ${MIN_LENGTH} caracteres.`,
      });
      return;
    }
    if (password !== confirm) {
      toast({
        variant: 'destructive',
        title: 'Senhas não coincidem',
        description: 'A confirmação deve ser igual à nova senha.',
      });
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsSaving(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível alterar a senha',
        description: translateAuthError(error.message),
      });
      return;
    }

    // Libera a navegação só depois que a senha realmente mudou.
    clearPasswordRecovery();
    toast({
      title: 'Senha alterada',
      description: 'Pronto! Você já está conectado.',
    });
    navigate('/whatsapp', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle>Criar nova senha</CardTitle>
          </div>
          <CardDescription>
            {linkInvalido
              ? 'Este link não é mais válido.'
              : 'Escolha uma senha nova para entrar na plataforma.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {linkInvalido ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Links de recuperação valem por tempo limitado e só podem ser usados uma vez.
                Peça um novo na tela de entrada.
              </p>
              <Button className="w-full" onClick={() => navigate('/auth')}>
                Voltar para a tela de entrada
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSaving}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Repita a nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar nova senha'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
