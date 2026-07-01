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
import { isDomainAllowed } from '@/utils/domainValidation';

const signupSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  companyCode: z.string().min(1, 'Código da empresa é obrigatório'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type SignupFormData = z.infer<typeof signupSchema>;

export function SignupForm() {
  const [isLoading, setIsLoading] = useState(false);
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);

    try {
      // Verificar restrição de domínio e aprovação antes de criar conta
      const { data: configs } = await supabase
        .from('project_config')
        .select('key, value')
        .in('key', ['restrict_signup_by_domain', 'allowed_email_domains', 'require_account_approval']);

      const isRestrictionEnabled = configs?.find(c => c.key === 'restrict_signup_by_domain')?.value === 'true';
      const requireApproval = configs?.find(c => c.key === 'require_account_approval')?.value === 'true';
      const allowedDomainsString = configs?.find(c => c.key === 'allowed_email_domains')?.value || '';
      const allowedDomains = allowedDomainsString
        .split(',')
        .map(d => d.trim())
        .filter(Boolean);

      // Validar domínio do email
      if (!isDomainAllowed(data.email, allowedDomains, isRestrictionEnabled)) {
        const domainsText = allowedDomains.map(d => `@${d}`).join(', ');
        toast({
          variant: 'destructive',
          title: 'Domínio não permitido',
          description: `Apenas emails com os seguintes domínios podem se cadastrar: ${domainsText}`,
        });
        setIsLoading(false);
        return;
      }

      // Validar código da empresa
      const companyCode = data.companyCode.trim().toUpperCase();
      const { data: company, error: companyError } = await (supabase.from as any)('companies')
        .select('id, name, status')
        .eq('code', companyCode)
        .maybeSingle();

      if (companyError || !company) {
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
        />
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
