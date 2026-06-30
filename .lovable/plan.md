## Mostrar sempre ícone + texto nos botões Assumir/Transferir

No `src/components/chat/ChatHeader.tsx`, remover o `hidden 2xl:inline` dos labels dos botões **Assumir** e **Transferir**, deixando-os sempre visíveis ao lado do ícone (como na segunda imagem).

- Botão **Assumir**: ícone `UserPlus` + texto "Assumir" sempre visíveis.
- Botão **Transferir**: ícone `Repeat` + texto "Transferir" sempre visíveis.
- Ajustar padding para o padrão (`px-3`) em vez de `px-2 2xl:px-3`.

Os botões continuam na faixa de ações (segunda linha) com scroll horizontal já existente, garantindo que mesmo em telas estreitas o conteúdo não corte — apenas role. Os botões **Sentimento** e **Analisar** permanecem como estão (sentimento já mostra label, analisar continua só ícone, conforme já estava antes da última alteração também).
