## Problema

No `ChatHeader.tsx`, o botão **Transferir** só aparece quando `!isInQueue && canTransfer`. Ou seja, se a conversa está na fila (não atribuída), admin/supervisor só veem "Assumir" — não conseguem transferir direto para outro agente. E quando a conversa já está atribuída a outro agente, em alguns cenários a UI não está renderizando corretamente para o admin.

## Solução

Ajustar a lógica de renderização dos botões em `src/components/chat/ChatHeader.tsx`:

1. **Botão "Assumir"**: continua aparecendo quando a conversa está na fila (`isInQueue`), para qualquer usuário (admin, supervisor, agent).
2. **Botão "Transferir"**: passa a aparecer sempre que o usuário for admin ou supervisor (`canAssign`), OU quando for o agente atribuído (`isAssignedToMe`) — independente de a conversa estar na fila ou não. Assim:
   - Admin/Supervisor sempre veem "Transferir" (podem atribuir conversas da fila a um agente, ou redirecionar uma já atribuída).
   - Agente vê "Transferir" apenas quando a conversa é dele.

### Alteração técnica

Em `ChatHeader.tsx`, substituir a condição do botão Transferir:

```tsx
// Antes
{conversation && !isInQueue && canTransfer && ( ... )}

// Depois
{conversation && (canAssign || (!isInQueue && isAssignedToMe)) && ( ... )}
```

A `AssignAgentDialog` já aceita `isTransfer` e funciona tanto para atribuir da fila quanto para transferir entre agentes — nenhuma mudança necessária ali.

### Escopo

- Apenas frontend (`src/components/chat/ChatHeader.tsx`).
- RLS e hooks de atribuição (`useConversationAssignment`) já permitem admin/supervisor executar a ação; não há mudança de backend.
