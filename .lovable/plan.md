## Objetivo

Ativar a conta `rhl0508@gmail.com` com a senha `Renata0508` e corrigir o convite para não travar mais nesse cenário.

## O que será feito

### 1. Nova Edge Function: `activate-team-member`
- Recebe `email`, `password`, `fullName?`, `role?` (default `agent`).
- Valida que o chamador é `admin` (via JWT + `has_role`).
- Localiza o usuário em `auth.users`; se não existir, retorna erro.
- Atualiza via Admin API: `password`, `email_confirm=true`.
- Faz upsert em `public.profiles` com `is_active=true`, `is_approved=true`.
- Faz upsert em `public.user_roles` com a role escolhida.

### 2. Ajuste em `invite-team-member`
- Quando `createUser` falha com `email_exists`:
  - Busca o usuário existente
  - Se não tiver profile/role, cria-os (em vez de retornar 409)
  - Confirma email automaticamente
- Caso já esteja totalmente configurado, retorna 409 com mensagem clara.

### 3. Execução
- Após o deploy, chamo `activate-team-member` uma vez com:
  - email: `rhl0508@gmail.com`
  - password: `Renata0508`
  - role: `agent`

A pessoa poderá então entrar em `https://chat-heartbeat-57.lovable.app` com essas credenciais. **Recomendado trocar a senha após o primeiro login.**

### Arquivos
- Novo: `supabase/functions/activate-team-member/index.ts`
- Editado: `supabase/functions/invite-team-member/index.ts`
