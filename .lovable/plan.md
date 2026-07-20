## Problema

A agente Eduarda não consegue criar uma nova conversa. As policies de INSERT em `whatsapp_contacts` e `whatsapp_conversations` exigem papel `admin` ou `supervisor` (ou super admin com acesso). Agentes são bloqueados pelo RLS mesmo tendo acesso à instância.

## Solução

Ajustar as policies de INSERT nas duas tabelas para também permitir que **agentes** criem registros, desde que:
- Sejam da mesma empresa da instância (`company_id = get_user_company_id(auth.uid())`)
- Tenham acesso à instância alvo via `can_user_see_instance(auth.uid(), instance_id)` (cobre `agent_instance_access` e admin/supervisor da empresa)
- Estejam ativos e aprovados

## Alterações no banco (via migration)

1. `whatsapp_contacts`
   - Substituir a policy `ALL` "Supervisors can manage contacts" por policies separadas:
     - Manter INSERT/UPDATE/DELETE atuais para admin/supervisor/super admin.
     - Adicionar policy INSERT para `authenticated` permitindo agentes com `can_user_see_instance(auth.uid(), instance_id)` e mesma empresa; exigir profile ativo/aprovado.

2. `whatsapp_conversations`
   - Ampliar a policy INSERT "Service can insert conversations" para incluir agentes com `can_user_see_instance(auth.uid(), instance_id)` e mesma empresa (profile ativo/aprovado), preservando super admin e admin/supervisor.

Nenhuma mudança em SELECT/UPDATE/DELETE. Nenhuma mudança de código frontend — `useCreateConversation` já envia `instance_id` e `company_id` (via trigger `set_company_id_from_instance`).

## Verificação

- Rodar security linter após a migration.
- Confirmar via `supabase--read_query` que as policies novas existem.
- Pedir para Eduarda tentar novamente após deploy.
