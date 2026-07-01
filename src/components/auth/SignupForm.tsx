import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { translateAuthError } from '@/utils/authErrorMessages';
import { supabase } from '@/integrations/supabase/client';

const signupSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  companyCode: z.string().min(1, 'Código da empresa é obrigatório'),
  password: z.string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Inclua ao menos uma letra minúscula')
    .regex(/[0-9]/, 'Inclua ao menos um número'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type SignupFormData = z.infer<typeof signupSchema>;

export function SignupForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const passwordStrength = (() => {
    let score = 0;
    if (passwordValue.length >= 8) score++;
    if (/[A-Z]/.test(passwordValue) && /[a-z]/.test(passwordValue)) score++;
    if (/[0-9]/.test(passwordValue)) score++;
    if (/[^A-Za-z0-9]/.test(passwordValue)) score++;
    if (passwordValue.length >= 12) score++;
    return score;
  })();
  const strengthLabel = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte', 'Muito forte'][passwordStrength];
  const strengthColor = ['bg-destructive', 'bg-destructive', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600'][passwordStrength];

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);

    try {
      const companyCode = data.companyCode.trim().toUpperCase();

      // Validação server-side de domínio permitido e política de aprovação
      const { data: eligibility, error: eligibilityError } = await supabase.functions.invoke(
        'check-signup-eligibility',
        { body: { email: data.email, companyCode } }
      );

      if (eligibilityError || !eligibility) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível validar o cadastro',
          description: 'Tente novamente em instantes.',
        });
        setIsLoading(false);
        return;
      }

      const requireApproval = !!eligibility.requireApproval;

      if (!eligibility.allowed) {
        toast({
          variant: 'destructive',
          title: 'Domínio não permitido',
          description: 'O domínio do seu email não está autorizado a se cadastrar. Fale com o administrador.',
        });
        setIsLoading(false);
        return;
      }

      const company = eligibility.company;
      if (!company) {
        toast({
          variant: 'destructive',
          title: 'Código de empresa inválido',
          description: 'Verifique o código fornecido pelo administrador da sua empresa.',
        });
        setIsLoading(false);
        return;
      }

      if (company.status === 'suspended') {
        toast({
          variant: 'destructive',
          title: 'Empresa suspensa',
          description: 'Esta empresa está com acesso suspenso. Entre em contato com o suporte.',
        });
        setIsLoading(false);
        return;
      }

      const { error } = await signUp(data.email, data.password, data.fullName, company.id);

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Erro ao criar conta',
          description: translateAuthError(error.message),
        });
      } else {
        if (requireApproval) {
          toast({
            title: 'Conta criada com sucesso!',
            description: 'Sua conta está aguardando aprovação de um administrador. Você receberá acesso em breve.',
            duration: 7000,
          });
        }
        navigate('/whatsapp');
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Ocorreu um erro ao criar sua conta. Tente novamente.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Nome completo</Label>
        <Input
          id="fullName"
          type="text"
          placeholder="Seu nome completo"
          {...register('fullName')}
          disabled={isLoading}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="seu@email.com"
          {...register('email')}
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="companyCode">Código da empresa</Label>
        <Input
          id="companyCode"
          type="text"
          placeholder="Digite o código da sua empresa"
          {...register('companyCode')}
          disabled={isLoading}
          className="uppercase"
        />
        {errors.companyCode && (
          <p className="text-sm text-destructive">{errors.companyCode.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password">Senha</Label>
        <Input
          id="signup-password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          disabled={isLoading}
          onChange={(e) => {
            setPasswordValue(e.target.value);
            register('password').onChange(e);
          }}
        />
        {passwordValue && (
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${strengthColor}`}
                style={{ width: `${(passwordStrength / 5) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Força: {strengthLabel}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Use 8+ caracteres com maiúsculas, minúsculas e números. Evite senhas comuns ou já vazadas.
        </p>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar senha</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          {...register('confirmPassword')}
          disabled={isLoading}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Criando conta...
          </>
        ) : (
          'Criar conta'
        )}
      </Button>
    </form>
  );
}
