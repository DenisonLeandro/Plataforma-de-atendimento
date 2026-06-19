# Fechar conversa com ESC

## Mudança

Em `src/pages/WhatsApp.tsx`, adicionar um `useEffect` que registra um listener global de `keydown`. Quando a tecla pressionada for `Escape` e houver `selectedConversation`, chamar `setSelectedConversation(null)` — voltando para a tela inicial (sem conversa aberta), igual quando o usuário acabou de logar.

### Detalhes

- Ignorar o ESC se o foco estiver em `input`, `textarea` ou elemento com `contenteditable` (evita interferir em modais, busca, composer, edição de mensagem etc. — Radix já fecha esses com ESC).
- Ignorar se `event.defaultPrevented` for true (algum componente já tratou).
- Limpar o listener no unmount.

### Fora de escopo

- Não mudar UI/visual.
- Não alterar comportamento mobile (já existe botão "Voltar").
- Não mexer em modais/popovers (Radix já cuida do ESC deles).
