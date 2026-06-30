Alinhar todas as ações à direita, com tamanho reduzido:

Em `src/components/chat/ChatHeader.tsx`, na faixa de ações (segunda linha):

- Adicionar `justify-end` ao container e remover o `ml-auto` do bloco do kebab/settings (já ficará à direita por padrão).
- Reduzir os botões **Assumir**, **Transferir** e **Analisar**:
  - `h-7` em vez de `h-8`
  - `px-2.5` em vez de `px-3`
  - `text-xs`
  - Ícones em `h-3.5 w-3.5` com `mr-1.5`
- Reduzir o `SentimentCard` em `src/components/chat/SentimentCard.tsx`:
  - Badge com `px-2 py-0.5 text-[11px]`
  - Emoji em `text-sm`
- Ícones do kebab/settings com `size="sm"` (h-8 w-8) em vez de `size="icon"` (h-10 w-10), para combinar com a nova altura.

Resultado: Assumir | Transferir | Sentimento | Analisar | ⋮ ⚙ — tudo alinhado à direita, compacto, sem cortar o nome do contato na linha de cima.