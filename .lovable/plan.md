## Problema

A Eduarda (agent) conseguiu criar o contato, mas não conseguiu **assumir/transferir** a conversa. A RPC `assign_conversation` chama `can_access_conversation`, que para agents comuns só libera se:

- a conversa já está atribuída a ela, **ou**
- está sem dono E existe uma `assignment_rule` que a inclui.

Se outro atendente já assumiu, ou não há regra de atribuição, a agent recebe "Sem permissão para atribuir esta conversa".

## Objetivo

Qualquer usuário ativo/aprovado que enxerga a instância deve poder **assumir, transferir ou devolver** conversas daquela instância.

## Mudança (única, no banco)

Redefinir `public.assign_conversation` trocando o guarda de permissão:

- **Antes:** `IF NOT public.can_access_conversation(_caller, _conversation_id) THEN RAISE ...`
- **Depois:** permitir se o caller for super admin com acesso à empresa da conversa **OU** `public.can_user_see_instance(_caller, <instance_id da conversa>)` for verdadeiro (o que já cobre admin/supervisor da empresa e agents com `agent_instance_access`).

Mantém:
- Verificação de autenticação (`auth.uid()`).
- Validação do destinatário (`_assigned_to`) já existente: precisa ser ativo/aprovado e da mesma empresa da conversa (ou super admin com exceção).
- Registro em `conversation_assignments` e `UPDATE` em `whatsapp_conversations`.

Nada muda no frontend nem nas policies de RLS de leitura — a visibilidade da conversa para agents (já ajustada anteriormente via `can_view_conversation`) continua permitindo que a Eduarda veja e agora também atue sobre conversas da instância dela.

## Verificação

Após aplicar, testar como a Eduarda: assumir uma conversa atribuída a outro atendente e transferir de volta. Confirmar que aparece linha nova em `conversation_assignments`.
