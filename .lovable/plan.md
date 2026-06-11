## Objetivo
Eliminar o scroll da página inteira e garantir que cada coluna (sidebar, chat, detalhes) role internamente, mantendo headers/input/footer fixos. Sem mudanças visuais — apenas `height`, `min-height`, `overflow` e `flex-shrink`.

## Mudanças

### 1) `src/index.css` — root + scrollbars

- Em `@layer base`, adicionar regras para `html, body, #root`:
  - `html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }`
  - `#root { height: 100vh; height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }`
- Em `.app-grid`: já tem `height: 100%; min-height: 0;` — adicionar `overflow: hidden;`.
- Estender as regras existentes de scrollbar fina (atualmente em `.sidebar-conversation-list [data-radix-scroll-area-viewport]` e `.details-scroll`) para também cobrir `.chat-messages-scroll [data-radix-scroll-area-viewport]` (novo seletor para o ScrollArea do chat). Mantém a mesma cor/espessura — só amplia o alvo.

### 2) `src/pages/WhatsApp.tsx` — wrapper raiz

Trocar `h-screen` por `h-full` no wrapper externo (`<div className="flex flex-col h-screen ...">` → `h-full`), já que agora `#root` cuida do `100dvh`. Manter `overflow-hidden` e o `flex-1 overflow-hidden` no container do grid.

### 3) `src/components/chat/ChatArea.tsx` — garantir contenção

Já usa `flex-1 flex flex-col h-full min-h-0`. Adicionar `overflow-hidden` ao container raiz para isolar o scroll na zona de mensagens.

### 4) `src/components/chat/MessagesContainer.tsx` — scrollbar visível

- Manter `flex-1 relative min-h-0` no wrapper.
- Adicionar classe `chat-messages-scroll` no `<ScrollArea>` (para o CSS de scrollbar pegar).
- Nenhuma mudança estrutural.

### 5) `src/components/chat/input/MessageInputContainer.tsx`

Adicionar `shrink-0` ao container raiz (`<div className="border-t border-border bg-card">` → `+ shrink-0`) e idem no branch do `isRecording`. Garante que o input nunca encolha.

### 6) `src/components/chat/details/ConversationDetailsSidebar.tsx`

Já está correto (`min-h-0 overflow-hidden` no root, `shrink-0` no header, `flex-1 min-h-0 overflow-y-auto details-scroll` no conteúdo). Nenhuma mudança.

### 7) `src/components/conversations/ConversationsSidebar.tsx`

Já está correto (`flex flex-col h-full w-full min-h-0 overflow-hidden`, ScrollArea com `flex-1 min-h-0 sidebar-conversation-list`, footer sem `shrink-0` explícito mas implícito por ser fora do flex-1). Adicionar `shrink-0` ao header, à zona de busca e ao footer de paginação por segurança.

## Verificação
Após aplicar:
- Página não rola (sem scrollbar do navegador).
- Input de mensagem sempre visível no rodapé do chat.
- Scrollbar fina e visível em: lista de conversas, mensagens do chat, painel de detalhes.
- Headers (Conversas, nome do contato, Detalhes da Conversa) ficam fixos.
- Em 110%/125% de zoom: layout não quebra.

## Não alterado
Cores, fontes, espaçamentos, sombras, estrutura de componentes, lógica de negócio.