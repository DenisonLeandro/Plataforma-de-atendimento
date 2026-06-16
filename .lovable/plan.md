## Mudança

Ajustar a visibilidade dos botões **Assumir** e **Transferir** em `src/components/chat/ChatHeader.tsx` para seguir exatamente estas regras (vale para todos os cargos):

| Estado da conversa            | Assumir | Transferir |
| ----------------------------- | :-----: | :--------: |
| Sem dono (em fila)            |    ✅   |     ✅     |
| Atribuída ao usuário atual    |    —    |     ✅     |
| Atribuída a outra pessoa      |    —    |     —      |

## Como fica no código

Substituir a lógica atual (que escondia "Transferir" para atendentes na fila e dependia de `canAssign`) por:

```ts
const isInQueue = !conversation?.assigned_to;
const isAssignedToMe = conversation?.assigned_to === user?.id;

const showAssumir = isInQueue;
const showTransferir = isInQueue || isAssignedToMe;
```

E renderizar os botões usando essas duas flags. Remover as variáveis `canAssign` / `canTransfer` que não são mais necessárias.

Nenhuma mudança em hooks, RLS ou banco — a permissão de banco já foi corrigida na rodada anterior.
