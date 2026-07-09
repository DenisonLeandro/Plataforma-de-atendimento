## Problema

A função SQL `public.get_assignable_agents(_instance_id)` retorna TODOS os `profiles` com role admin/supervisor/agent, sem filtrar por empresa. Por isso a Estela (empresa A) vê atendentes das empresas B, C etc. no seletor de transferência.

## Correção (1 migration, sem mudança de código frontend)

Redefinir `public.get_assignable_agents` para:

1. Resolver o `company_id` da instância (`_instance_id`) via `whatsapp_instances`.
2. Retornar apenas atendentes ativos/aprovados cujo `profiles.company_id` seja igual ao `company_id` daquela instância.
3. Incluir também super admins que tenham exceção explícita para essa empresa em `super_admin_company_access` (para não quebrar o fluxo do Denison na empresa Piscinas).
4. Manter a mesma assinatura de retorno (`id, full_name, avatar_url, status, role, active_conversations`) para não quebrar o hook `useAssignableAgents` nem a UI.
5. Manter `SECURITY DEFINER` + `search_path = public, pg_temp`.

Nenhuma alteração no frontend é necessária — o `useAssignableAgents` continua chamando o RPC com o `instance_id` da conversa.

## Fora de escopo

- Não mexer em `can_user_see_instance`, `can_access_conversation`, `can_view_conversation`.
- Não mexer em `assign_conversation` (a validação ali é apenas "atendente válido"; o filtro de empresa é feito no seletor, e transferências cross-empresa continuam bloqueadas na prática porque o alvo não terá acesso).
- Sem novas tabelas, sem novas policies.

## Erros do build

Os erros mostrados são falhas transitórias de upload S3 (ServiceUnavailable / "Reduce your concurrent request rate"), não erros de código. Serão resolvidos no próximo build automático — não requerem ação.
