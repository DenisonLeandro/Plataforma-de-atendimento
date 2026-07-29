## Parte 1 — Correção imediata (Maria Eduarda)

Mesma correção pontual usada para a Giovana, aplicada ao `user_id = 38202eff-ac9e-441c-99e0-0d804c45b94a`:

1. `UPDATE profiles SET company_id = '<Acquadu>' WHERE id = <maria> AND company_id IS NULL`.
2. `UPDATE user_roles SET company_id = '<Acquadu>' WHERE user_id = <maria> AND company_id IS NULL`.
3. `INSERT INTO agent_instance_access (user_id, instance_id, company_id, created_by)` para a instância Acquadu, com `ON CONFLICT DO NOTHING`.

Depois disso ela precisa recarregar a página (ou sair/entrar) para o `AuthContext` recarregar profile/role.

Empresa Acquadu: `692489ea-feda-4df1-8dbd-e1c88375eaef` · Instância Acquadu: `6d5c6a9c-9bbe-4587-8aac-a277ffa8bca5`.

## Parte 2 — Diagnóstico do root cause

O `SignupForm` valida o código da empresa via `check-signup-eligibility` e chama `signUp(..., company.id)`. O `AuthContext.signUp` **envia** `company_id` em `options.data` do `supabase.auth.signUp`. Mas no `auth.users` da Maria só ficou `{ full_name, email_verified }` — o `company_id` **não chegou ao metadata**. Sem metadata, o trigger `handle_new_user` grava o profile sem `company_id`, e como o profile fica NULL a RLS esconde tudo.

Isso deixa o fluxo frágil: qualquer regressão em `check-signup-eligibility`, resposta sem `company.id`, ou usuário que confirme email antes do metadata materializar, cai no mesmo buraco silencioso — e o admin só descobre porque "não aparece nada" pra ela.

## Parte 3 — Blindagem do cadastro (para não repetir)

Trocar a estratégia de "confiar no metadata do signUp" por uma **finalização explícita e idempotente** logo após o cadastro:

1. Nova edge function `finalize-company-signup` (SECURITY DEFINER via service role), que recebe `{ companyCode }` e, para o `auth.uid()` do chamador:
   - revalida a empresa por código (mesma lógica do `check-signup-eligibility`, incluindo `status != 'suspended'` e domínio permitido);
   - `UPDATE profiles SET company_id = <company.id> WHERE id = auth.uid() AND company_id IS NULL`;
   - `UPDATE user_roles SET company_id = <company.id> WHERE user_id = auth.uid() AND company_id IS NULL`;
   - não atribui instâncias (isso continua sendo escolha do admin em Team → Acesso a instâncias) — apenas garante o vínculo com a empresa.
2. `SignupForm.onSubmit`: após `signUp` retornar sem erro **e** existir sessão, chamar `finalize-company-signup` com o `companyCode` antes de navegar para `/whatsapp`. Se a chamada falhar, mostrar toast pedindo para tentar de novo (nada de navegar "quebrado").
3. Fluxo com confirmação de email: como a sessão só aparece após o clique no link, disparar `finalize-company-signup` também no `AuthContext`, uma única vez por sessão, quando detectarmos um profile logado **com `company_id` NULL** e houver um `companyCode` guardado em `sessionStorage` no momento do signup. Isso cobre o caminho "confirmou email depois".
4. Admin passa a ver `TeamMembersList` com uma marca de "sem empresa vinculada" para qualquer profile com `company_id IS NULL` da sua empresa, com botão "Vincular à minha empresa" — rede de segurança visual (não é o fluxo principal, é fallback).

Nada de mudança em RLS, schema, ou nas policies existentes; a Parte 3 é só código de aplicação + uma edge function nova.

## Ordem de execução

1. Rodar a migração de dados da Parte 1 (destrava a Maria Eduarda agora).
2. Implementar Parte 3 (edge function + hooks do SignupForm e AuthContext + badge no TeamMembersList).
3. Testar cadastrando um usuário novo por código de empresa e conferindo que `profiles.company_id` e `user_roles.company_id` ficam preenchidos imediatamente.

## Fora de escopo

- Auto-atribuição de instâncias no cadastro (continua com o admin).
- Alterações em `handle_new_user` ou em RLS.
