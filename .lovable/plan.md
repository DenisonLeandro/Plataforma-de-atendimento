Ajuste os filtros rápidos da sidebar de conversas para exibir todas as 5 opções em uma única linha (Todas, Não lidas, Aguardando, Na Fila, Minhas) e mover o botão "Filtros" para a linha seguinte, abaixo das pills, conforme a imagem anexa. Reduzir levemente o tamanho da fonte/espaçamento das pills se necessário para garantir visibilidade completa na largura disponível.

## Escopo
- Alterar somente o layout da seção de filtros em `src/components/conversations/ConversationsSidebar.tsx`.
- Garantir que `QuickFilterPills` mantenha as 5 opções existentes na ordem: Todas, Não lidas, Aguardando, Na Fila, Minhas (adicionar Minhas ao final se necessário).
- Reposicionar o botão `ConversationFiltersPopover` para uma linha abaixo das pills, alinhado à direita ou à esquerda conforme melhor aproveitamento.
- Reduzir `text-xs`/`px` dos botões das pills se o espaço for insuficiente.
- Preservar comportamento existente: contadores, estado, paginação e ações.

## Arquivos
- `src/components/conversations/ConversationsSidebar.tsx` (reorganização do layout de filtros).
- `src/components/conversations/QuickFilterPills.tsx` (ajustes de tamanho/ordem das pills, se necessário).

## Critério de aceitação
- Na viewport atual (1088x772), as 5 pills devem aparecer sem corte.
- O botão "Filtros" deve aparecer em uma linha separada, abaixo das pills.
- A funcionalidade de filtro permanece inalterada.