# Melhoria estética do header de filtros da sidebar de conversas

## Problema
O header atual da sidebar de conversas apresenta espaços em branco e áreas vazias entre a lista de conversas e os filtros, prejudicando a experiência visual e o aproveitamento do espaço na largura estreita da sidebar (~280-320 px).

## Solução escolhida
**Opção A — Grid flexível de pills** (imagem anexa).
- As 5 pills (Todas, Minhas, Não lidas, Aguardando, Na Fila) ficam em um grid flexível que quebra linha automaticamente conforme a largura disponível.
- O botão "Filtros" vira uma pill no final do grid, eliminando a segunda linha vazia e acomodando melhor a área de busca.
- Reduz espaços em branco entre busca, filtros e lista de conversas.
- Mantém todos os comportamentos existentes: contadores, paginação, estado de filtro, ações de nova conversa e notificações.

## Arquivos
- `src/components/conversations/ConversationsSidebar.tsx` — reorganização do layout do header de filtros.
- `src/components/conversations/QuickFilterPills.tsx` — ajustes de quebra de linha, ordem e tamanho das pills; integração do botão Filtros como pill opcional.
- `src/components/conversations/ConversationFiltersPopover.tsx` — ajuste mínimo de visual se necessário para manter consistência com as pills.

## Critérios de aceitação
- As 5 pills de filtro rápido devem estar visíveis sem corte na viewport de 1088 px de largura.
- O botão "Filtros" deve ficar integrado ao grid de pills, sem criar uma linha separada com espaço vazio.
- A área de busca e a lista de conversas devem ficar mais próximas, reduzindo o espaço em branco vertical.
- Funcionalidade de filtros, paginação e contadores permanece inalterada.
- A mudança respeita os tokens de design do projeto (sem cores hardcoded, usa as variáveis do tema).
