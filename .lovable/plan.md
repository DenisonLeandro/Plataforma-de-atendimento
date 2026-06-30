Mostrar sempre o label nos botões **Analisar** e **Sentimento**, como antes:

- `src/components/chat/ChatHeader.tsx`: no botão Analisar, remover `hidden 2xl:inline` do span "Analisar" e usar padding fixo `px-3`.
- `src/components/chat/SentimentCard.tsx`: remover os spans `hidden 2xl:inline` / `2xl:hidden` para exibir sempre "Positivo/Negativo/Neutro" (e "Sem análise" no estado vazio) ao lado do emoji.

A faixa de ações já tem scroll horizontal, então em telas estreitas os botões rolam sem cortar nome/número do contato.