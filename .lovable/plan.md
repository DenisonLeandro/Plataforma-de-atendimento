## Objetivo

Restaurar dois scrolls que quebraram após o refino visual, sem mexer em cores, fontes, espaçamentos ou lógica:

1. **Lista de conversas** — scroll vertical até a última conversa.
2. **Chips de filtro** — scroll horizontal para revelar "Aguardando", "Em atendimento" etc.

## Causa identificada

- `src/pages/WhatsApp.tsx` (linha 68): o wrapper de coluna da sidebar (`<div className="border-r border-subtle min-w-0">`) não tem `h-full flex flex-col`. Sem altura explícita propagada, o `h-full` interno do `ConversationsSidebar` colapsa em alguns casos e o `ScrollArea` perde altura.
- `src/components/conversations/ConversationsSidebar.tsx` (linha 184): o root `flex flex-col h-full w-full` não tem `min-h-0 overflow-hidden`. Em flexbox aninhado, sem `min-h-0` o `ScrollArea` (`flex-1`) não consegue encolher e o scroll vertical desaparece.
- `src/components/conversations/QuickFilterPills.tsx` (linha 31): usa a utilitária `.scrollbar-hide` (definida em `index.css`), o que esconde completamente a scrollbar. Além disso, o wrapper em `ConversationsSidebar.tsx` (`flex items-center justify-between gap-2` com `QuickFilterPills` + `ConversationFiltersPopover` lado a lado) não dá `min-w-0` ao container dos pills, então os pills não recebem largura limitada para acionar overflow horizontal de forma confiável.

## Mudanças (somente CSS/classes)

### 1. `src/pages/WhatsApp.tsx`
- Linha 68: adicionar `h-full flex flex-col min-h-0` ao wrapper da sidebar de conversas.
- Linha 97: adicionar `h-full` ao wrapper da `ConversationDetailsSidebar` (mesmo motivo, prevenção).

### 2. `src/components/conversations/ConversationsSidebar.tsx`
- Linha 184 (root da view expandida): trocar para `flex flex-col h-full w-full min-h-0 overflow-hidden bg-bg-surface`.
- `ScrollArea` (linha ~268): adicionar `min-h-0` à className (`flex-1 min-h-0`).
- Wrapper que contém `QuickFilterPills` + `ConversationFiltersPopover` (linha ~243): garantir `min-w-0` no container do `QuickFilterPills` envolvendo-o em `<div className="flex-1 min-w-0 relative">` (sem mudar layout visual). O popover continua `flex-shrink-0`.

### 3. `src/components/conversations/QuickFilterPills.tsx`
- Linha 31: remover `scrollbar-hide`, adicionar `min-w-0` e classe `sidebar-filters` para receber estilos. Resultado: `flex gap-1.5 overflow-x-auto overflow-y-hidden flex-nowrap pb-1.5 min-w-0 sidebar-filters`.

### 4. `src/index.css`
- Adicionar regras de scrollbar visível fina (8px) para `.sidebar-filters` e para `[data-radix-scroll-area-viewport]` (o viewport real do `ScrollArea` do shadcn) dentro da sidebar de conversas, usando os tokens já existentes (`--brand-primary`). Cor do thumb: `hsl(var(--brand-primary) / 0.18)`, hover `0.32`, track transparente, border-radius pill. Inclui `scrollbar-width: thin` e `scrollbar-color` para Firefox e `-webkit-overflow-scrolling: touch` para iOS.
- Não remover as regras gerais de scrollbar já presentes — apenas garantir que `.sidebar-filters` e a lista não fiquem invisíveis.

## Não muda
- Cores, fontes, espaçamentos, sombras, radius — todos preservados.
- Lógica, hooks, rotas, dados — intocados.
- Componentes de chat, detalhes, banner — não tocados.

## Checklist de verificação após implementação
- Lista de conversas rola verticalmente; scrollbar fina visível no hover.
- Pills "Todas / Não lidas / Aguardando / Na Fila / Minhas" rolam horizontalmente quando a sidebar fica estreita.
- Cabeçalho (UserMenu), busca e linha de filtros permanecem fixos.
- Sem regressão visual — apenas overflow restaurado.
