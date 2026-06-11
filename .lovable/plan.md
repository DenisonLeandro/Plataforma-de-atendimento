## Fix scroll vertical no painel "Detalhes da Conversa"

**`src/components/chat/details/ConversationDetailsSidebar.tsx`**
- Root container: adicionar `min-h-0 overflow-hidden` ao `flex flex-col` (linha 54).
- Header (linha 56): adicionar `shrink-0`.
- `ScrollArea` (linha 69): adicionar `min-h-0` e classe `details-scroll` para CSS dirigir o viewport.
- Adicionar `pb-6` ao container interno para respiro inferior.

**`src/index.css`** — adicionar regras para o viewport do Radix ScrollArea dentro de `.details-scroll`, espelhando o estilo já usado na sidebar de conversas (thumb `--brand-primary / 0.18`, 8px, hover 0.32, scrollbar-width thin, overscroll-behavior contain, touch momentum).

Nenhuma alteração visual fora do scroll/scrollbar; estrutura, ordem das seções, cores e tipografia permanecem.
