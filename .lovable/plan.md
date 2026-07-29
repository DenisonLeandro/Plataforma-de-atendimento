## Diagnóstico (confirmado no banco)

O perfil da Giovana (`gi.casagrande@yahoo.com.br`, id `7d857d18…`) foi criado, mas ficou **sem vínculo com a empresa Acquadu**:

- `profiles.company_id` = **NULL**
- `user_roles`: existe uma linha (`role = agent`), mas com `company_id` = **NULL**
- `agent_instance_access`: **0 linhas** (nenhuma instância liberada para ela)

Como toda a RLS de conversas/contatos/mensagens é escopada por `company_id` e o filtro do front (`useWhatsAppConversations`) exige `companyId` para sequer disparar a query, ela não enxerga nada — nem as conversas da Acquadu, nem qualquer outra. Isso também explica os avisos no console:

```
[AuthContext] No profile found for user: 7d857d18…
[AuthContext] No role found for user: 7d857d18…
```

(o contexto exige `company_id` para considerar o perfil "válido").

A empresa e a instância existem e batem:

- Empresa Acquadu: `692489ea-feda-4df1-8dbd-e1c88375eaef`
- Instância Acquadu: `6d5c6a9c-9bbe-4587-8aac-a277ffa8bca5`

## Correção (apenas dados, sem mudança de código nem de RLS)

Uma migration curta que faz três coisas para o `user_id = 7d857d18-814c-4683-bec8-1ffcb1bb5b97`:

1. `UPDATE profiles SET company_id = '<Acquadu>' WHERE id = <giovana>` (só se estiver NULL).
2. `UPDATE user_roles SET company_id = '<Acquadu>' WHERE user_id = <giovana> AND company_id IS NULL`.
3. `INSERT INTO agent_instance_access (user_id, instance_id, company_id, created_by)` para a instância Acquadu, com `ON CONFLICT DO NOTHING` para ser idempotente.

Depois disso ela precisa **recarregar a página** (o `AuthContext` recarrega profile/role no próximo login/refresh) e as conversas da Acquadu passam a aparecer normalmente, respeitando a mesma RLS de agente que os outros atendentes da empresa.

## Observação de processo (fora do escopo desta correção)

O fluxo de "convidar membro" deveria já gravar `company_id` no profile e criar `agent_instance_access` no ato do convite. Se você quiser, num próximo passo posso auditar `invite-team-member` / cadastro de novo agente para evitar que outro usuário caia no mesmo estado — mas isso é mudança de código e fica separado desta correção pontual.
