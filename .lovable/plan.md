## Diagnóstico

Encontrei três limitações no fluxo de atribuição que correspondem aos três casos reportados.

### 1. Diálogo de atribuição nunca lista o próprio usuário
A função `public.get_assignable_agents` tem `AND p.id <> auth.uid()`. Como o `AssignAgentDialog` se alimenta dessa lista, é impossível selecionar a si mesmo — seja para "assumir" via diálogo, seja para um admin atribuir uma conversa a ele mesmo.

### 2. Botão "Assumir" só aparece quando a conversa está na fila
Em `ChatHeader.tsx`:
```ts
const showAssumir = isInQueue; // assigned_to == null
```
Resultado: se a conversa já está com outro agente, ninguém (nem admin/supervisor) tem botão para puxar pra si — só o botão "Transferir", que também está restrito.

### 3. Botão "Transferir" não aparece para admin/supervisor em conversas de terceiros
```ts
const showTransferir = isInQueue || isAssignedToMe;
```
Admin/supervisor visualizando uma conversa atribuída a outro agente não vê nenhum dos dois botões — daí o "não consigo transferir/assumir".

A RPC `assign_conversation` em si já autoriza admin/supervisor (via `can_access_conversation`); o bloqueio é puramente de UI + da função `get_assignable_agents`.

## Mudanças

### A. Migration: corrigir `get_assignable_agents`
Recriar a função removendo o filtro `p.id <> auth.uid()` para que o próprio usuário apareça na lista (necessário para "assumir via diálogo" e para admin se auto-atribuir). O filtro de quem aparece na UI continua sendo feito no cliente via `currentAssignee`.

### B. `ChatHeader.tsx`: liberar botões para admin/supervisor
- Receber o papel do usuário (via hook existente `useAuth` + checagem de role; usar o mesmo padrão de admin já usado em outras telas — confirmar qual hook expõe a role, ex.: `useAuth` ou consulta `user_roles`).
- Novas regras:
  - `showAssumir = (isInQueue || isAdminOrSupervisor) && !isAssignedToMe`
  - `showTransferir = isInQueue || isAssignedToMe || isAdminOrSupervisor`
- `handleAssumeFromQueue` continua chamando `assignConversation` com `assignedTo: user.id` — funciona para admin reassumindo de outro agente (a RPC permite).

### C. `AssignAgentDialog.tsx`: rótulo coerente
- Quando `isTransfer` for true mas o `currentAssignee` for outro (cenário admin reatribuindo), manter título "Transferir Conversa" (já está bom). Nenhuma mudança estrutural; só garantir que `availableAgents = agents.filter(a => a.id !== currentAssignee)` continue excluindo apenas o atual responsável (agora a lista inclui o próprio usuário quando ele não é o responsável).

## Detalhes técnicos

- A RPC `assign_conversation` já valida permissão server-side; nenhuma mudança nela.
- A migration apenas substitui a definição da função (CREATE OR REPLACE) — sem impacto em dados.
- Sem mudanças em RLS, grants ou tabelas.

## Fora de escopo
- Não vou mexer na função `can_access_conversation` nem em policies.
- Não vou alterar o fluxo de "devolver para fila" (já funciona).
