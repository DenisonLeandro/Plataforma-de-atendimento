## Causa raiz

O `SignupForm.tsx` valida o código da empresa fazendo `supabase.from('companies').select(...).eq('code', ...)` direto do navegador — **sem usuário autenticado ainda**. A tabela `public.companies` só tem policies de SELECT para (a) super_admin e (b) "usuários da própria empresa". Como o visitante do signup é anônimo, o RLS filtra 100% das linhas e o resultado vem vazio → o form mostra "Código de empresa inválido", mesmo quando o código existe.

Não é bug do código digitado nem dado ruim — é bloqueio de RLS na consulta pré-signup.

## Correção proposta (mínima, sem abrir a tabela `companies` para o público)

Mover a validação do código para o backend, reutilizando a Edge Function `check-signup-eligibility` (já é chamada nesse mesmo fluxo, roda com service role e ignora RLS com segurança).

### 1. `supabase/functions/check-signup-eligibility/index.ts`
- Aceitar campo opcional `companyCode` no body.
- Quando presente: normalizar (`trim().toUpperCase()`), buscar `id, name, status` em `public.companies` pelo `code` usando o client service-role.
- Retornar no JSON:
  - `company: { id, name, status } | null`
  - `companyCodeValid: boolean`
  - `companyStatus: 'active' | 'suspended' | null`
- Manter comportamento atual (`allowed`, `requireApproval`) intacto para não quebrar outros consumidores.

### 2. `src/components/auth/SignupForm.tsx`
- Enviar `companyCode` já no `functions.invoke('check-signup-eligibility', { body: { email, companyCode } })`.
- Remover o bloco que faz `supabase.from('companies').select(...)` no cliente.
- Usar `eligibility.company` / `eligibility.companyStatus` para as mensagens de erro existentes:
  - Sem empresa → "Código de empresa inválido".
  - `status === 'suspended'` → "Empresa suspensa".
  - Caso ok → seguir com `signUp(..., company.id)` como hoje.

Nenhuma outra tela, RLS, migration ou função é tocada. A policy pública de `companies` **não** é adicionada (mantém a superfície segura).

## Validação
- `npm run build` deve passar.
- Cadastrar uma conta nova com código válido → deve prosseguir para criação de conta.
- Cadastrar com código inexistente → mensagem "Código de empresa inválido".
- Cadastrar com código de empresa suspensa → mensagem "Empresa suspensa".

## Fora de escopo
- Não altero RLS de `companies`.
- Não altero `create-company-admin`, super admin, nem fluxo de login.
- Não mudo estilo/cor de nada.
