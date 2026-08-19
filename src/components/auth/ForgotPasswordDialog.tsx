import { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** E-mail já digitado na tela de login, para a pessoa não redigitar. */
  defaultEmail?: string;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  defaultEmail = '',
}: ForgotPasswordDialogProps) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState(defaultEmail);
  const [isSending, setIsSending] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSending(true);
    await resetPassword(email.trim());
    setIsSending(false);

    // Confirmação neutra de propósito: mostramos a mesma tela exista ou não a
    // conta. Responder "e-mail não cadastrado" transformaria esta janela num
    // verificador de quem trabalha nos escritórios.
    setEnviado(true);
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // Reseta ao fechar para a próxima abertura começar limpa.
      setEnviado(false);
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {enviado ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <MailCheck className="h-5 w-5 text-primary" />
                <DialogTitle>Verifique seu e-mail</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                Se <strong>{email}</strong> estiver cadastrado, enviamos um link para criar
                uma nova senha. O link vale por tempo limitado e só pode ser usado uma vez.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Não encontrou? Confira a caixa de spam ou lixo eletrônico.
            </p>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)} className="w-full">
                Entendi
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Esqueci minha senha</DialogTitle>
              <DialogDescription>
                Informe o e-mail da sua conta. Enviaremos um link para você criar uma senha nova.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-4">
              <Label htmlFor="recovery-email">E-mail</Label>
              <Input
                id="recovery-email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSending}
                autoFocus
                required
              />
            </div>

            <DialogFooter>
              <Button type="submit" className="w-full" disabled={isSending || !email.trim()}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar link de recuperação'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
