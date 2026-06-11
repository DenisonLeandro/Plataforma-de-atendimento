## Causa

O `ScrollArea` do Radix sobrescreve `scrollbar-width: none` no viewport interno e só mostra scrollbar se um `<ScrollBar />` filho for renderizado — por isso o conteúdo rola mas a barra não aparece.

## Correção

**`src/components/chat/details/ConversationDetailsSidebar.tsx`**
- Remover `ScrollArea` do Radix e usar um `<div>` nativo com `overflow-y-auto` + classe `details-scroll`.
- Remover import não usado.

**`src/index.css`**
- Trocar os seletores `.details-scroll [data-radix-scroll-area-viewport]` para mirar `.details-scroll` diretamente (que agora é o próprio elemento rolável).

Nenhum outro componente afetado (sidebar de conversas continua usando ScrollArea Radix com sua própria regra).
