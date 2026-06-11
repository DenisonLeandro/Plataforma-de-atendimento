## Contexto
Reorganizar o layout interno do card de conversa na lista (`ConversationItem.tsx`) para alinhar timestamp e atendente à direita, em uma coluna meta dedicada, sem alterar estilo visual, paleta ou outros componentes.

## Alterações

### 1. `src/components/conversations/ConversationItem.tsx`
- Substituir o layout flex atual (`flex items-center gap-3`) por um grid de 3 colunas:
  - Coluna 1: avatar (`shrink-0`)
  - Coluna 2: conteúdo principal (`min-w-0`, `flex-col`)
  - Coluna 3: meta (`shrink-0`, `items-end`, `flex-col`)
- **Mover o timestamp** da linha "nome + timestamp" para a coluna meta (canto superior direito).
- **Mover o atendente** da linha inferior de status (`QueueIndicator` quando atribuído) para a coluna meta, abaixo do timestamp, como um pill compacto com ícone `User` e nome truncado.
- **Manter** na coluna de conteúdo: nome (com ellipsis), preview, botão de editar (se sem nome), emoji de sentimento, ícone de search (se `foundByContent`), `ResponseStatusIndicator`, badge de unread, `TopicBadges`, e badge de estado "Encerrada"/"Arquivada".
- **Ajustar** `QueueIndicator` para continuar exibindo apenas "Na Fila" quando não houver atendente; quando houver atendente, ele não deve mais renderizar o pill do atendente (pois esse pill agora fica na coluna meta).
  - Alternativa: manter `QueueIndicator` intacto e simplesmente não renderizá-lo quando houver atendente, renderizando o pill na meta em vez disso. Isso é mais seguro para não afetar outros usos de `QueueIndicator`.
- Aplicar padding compensatório (`pl-[13px]`) quando `isSelected` para a borda de 3px à esquerda.

### 2. Componentes auxiliares
- `QueueIndicator.tsx`: não alterar (manter comportamento atual para evitar regressões em outros locais).
- `TopicBadges.tsx`: não alterar.

## CSS/Tailwind
Todas as mudanças são feitas com classes Tailwind existentes. Nenhum CSS customizado novo é necessário. Tokens de cor, tipografia e spacing do projeto são preservados integralmente.

## Critérios de aceite
- Horário aparece no canto superior direito de cada card.
- Pill do atendente aparece abaixo do horário, alinhado à direita, com ícone User.
- Atendente NÃO aparece mais como tag na linha inferior do conteúdo.
- Tags de tópico e estado permanecem na linha inferior do conteúdo.
- Nome longo trunca com ellipsis sem empurrar o horário.
- Cards sem atendente mostram apenas o horário no canto direito (ou "Na Fila" na linha inferior, conforme hoje).
- Nenhum outro componente ou página é modificado.