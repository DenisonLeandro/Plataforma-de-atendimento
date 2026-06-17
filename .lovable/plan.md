## Objetivo

Adicionar uma nova área "Acesso a Instâncias" nas Configurações onde o admin define, por agente, quais instâncias ele enxerga na plataforma. Quando um agente tem restrição configurada, ele só vê conversas/mensagens/contatos daquelas instâncias — exceto conversas onde ele já é o `assigned_to` (essas continuam aparecendo mesmo sendo de outra instância).

## Comportamento

- **Sem regra configurada para o agente** → vê todas as instâncias (comportamento atual, sem regressão).
- **Com regra configurada** → vê apenas as instâncias selecionadas + as conversas em que `assigned_to = ele`.
- A restrição **vale para todos** (admin, supervisor, agent), como solicitado.
- Filtro de instâncias da sidebar passa a listar somente as instâncias permitidas.
- Conversas, mensagens, contatos, métricas e relatórios respeitam o mesmo filtro (via RLS no backend, não só no frontend).

## Mudanças no banco

Nova tabela `agent_instance_access`:
- `user_id` (uuid, FK profiles)
- `instance_id` (uuid, FK whatsapp_instances)
- `created_at`, `created_by`
- Unique (user_id, instance_id)

Função `public.can_user_see_instance(_user_id, _instance_id)` (SECURITY DEFINER):
- Se NÃO existe nenhuma linha em `agent_instance_access` para `_user_id` → retorna `true` (sem restrição).
- Se existe → retorna `true` apenas se a instância estiver na lista.

Atualizar políticas RLS de:
- `whatsapp_instances` (SELECT): filtrar via `can_user_see_instance`.
- `whatsapp_conversations` (SELECT): permitir se `can_user_see_instance(auth.uid(), instance_id)` **OU** `assigned_to = auth.uid()`.
- `whatsapp_messages`, `whatsapp_contacts`, `whatsapp_sentiment_*`, `whatsapp_conversation_notes`, `whatsapp_conversation_summaries`, `whatsapp_topics_history`, `whatsapp_reactions`, `whatsapp_message_edit_history`: seguir a visibilidade da conversa via `can_access_conversation` (já existe) + a nova checagem de instância na conversa correspondente.

A função existente `can_access_conversation` será revisada para considerar a nova restrição de instância (mantendo a regra "se for o assigned_to, sempre vê").

Apenas admin pode ler/escrever em `agent_instance_access` (políticas RLS dedicadas).

## Mudanças no frontend

1. **Nova aba "Acesso a Instâncias"** em `src/pages/WhatsAppSettings.tsx` (visível só para admin), ao lado de "Equipe" e "Segurança".
2. **Novo componente** `src/components/settings/InstanceAccessManager.tsx`:
   - Lista de agentes (linhas).
   - Para cada agente, multi-select de instâncias permitidas.
   - Estado "Sem restrição (vê todas)" quando vazio.
   - Botão Salvar por linha.
3. **Novo hook** `src/hooks/useInstanceAccess.ts`: CRUD na tabela `agent_instance_access` agrupado por usuário.
4. Sem alterações no `InstanceFilter` nem em `useWhatsAppInstances` — eles já consomem `whatsapp_instances` via Supabase, e o RLS atualizado fará a filtragem automaticamente.
5. `src/components/settings/index.ts`: exportar `InstanceAccessManager`.

## Fora de escopo

- Não mexer em regras de atribuição (`assignment_rules`) — a nova área é independente.
- Não alterar a lógica de "assumir/transferir" do ChatHeader.
- Não tocar em fluxo de aprovação de contas nem ErrorBoundary.

## Validação

- Admin cria restrição para Maria → instância "Centro".
- Login com Maria: vê apenas instância "Centro" no filtro, e apenas conversas dessa instância (+ conversas antigas atribuídas a ela em outras instâncias, se houver).
- Remover a restrição (zero instâncias selecionadas) → Maria volta a ver todas.
