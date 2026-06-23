## Tarefa
Trocar o nome exibido da instância nas conversas de `instance_name` (técnico) para `name` (amigável, definido pelo usuário), mantendo o layout de 3 linhas já aprovado.

## Alterações

### 1. Query — `src/hooks/whatsapp/useWhatsAppConversations.ts`
- Incluir `name` no select da instância:
  `instance:whatsapp_instances(instance_name, name)`
- Atualizar o tipo inline `instance?: { instance_name: string; name: string } | null`.

### 2. Componente — `src/components/conversations/Conversation withItem.tsx`
- Atualizar o tipo `instance` para incluir `name: string`.
- Na linha 3 da coluna meta (instância), renderizar `conversation.instance?.name` em vez de `conversation.instance?.instance_name`.

Nenhuma outra alteração de layout ou estilo.
