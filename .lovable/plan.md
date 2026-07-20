## Causa raiz

O modal "Nova Conversa" faz `upsert` em `whatsapp_contacts` com `onConflict: instance_id,phone_number`. Quando o contato já existe na instância (caso do Lucas em Advocacia Centro), o PostgREST executa **UPDATE**, e a policy de UPDATE de `whatsapp_contacts` exige `can_access_conversation` — que, para agentes, só é verdadeira quando a conversa está atribuída ao próprio agente. A Eduarda enxerga a conversa (via `can_view_conversation`), mas não é a dona → UPDATE bloqueado → o erro exibido é "new row violates row-level security policy for table whatsapp_contacts".

Não tem nada a ver com criação. É o `upsert` reescrevendo um contato existente.

## Correção

Alinhar a policy de UPDATE de `whatsapp_contacts` à mesma regra de visibilidade das outras operações da tabela: qualquer agente que **enxerga** uma conversa vinculada ao contato pode atualizar os dados do contato. Isso mantém o escopo por instância/empresa (via `can_view_conversation`, que já checa `agent_instance_access`, admin/supervisor da empresa e super admin com acesso), sem exigir posse da conversa.

### Migration

Substituir a policy `Agents can update contacts of accessible conversations` em `public.whatsapp_contacts`:

- USING e WITH CHECK trocam `can_access_conversation(auth.uid(), c.id)` por `can_view_conversation(auth.uid(), c.id)`.
- Mantém o predicado `EXISTS (SELECT 1 FROM whatsapp_conversations c WHERE c.contact_id = whatsapp_contacts.id AND ...)`, então continua exigindo que exista pelo menos uma conversa que o usuário enxerga apontando pro contato — impede escrita cross-empresa.
- Não mexer em SELECT, INSERT, DELETE nem no upsert do frontend.

### Verificação

1. Rodar `supabase--linter` após a migration.
2. Confirmar via `read_query` que a policy nova reflete `can_view_conversation`.
3. Pedir para Eduarda repetir "Nova conversa" com o Lucas em Advocacia Centro.
