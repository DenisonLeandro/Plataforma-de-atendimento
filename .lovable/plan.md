## Objetivo
Tornar o botão "Encerrar conversa" visível diretamente no cabeçalho do chat, ao lado do botão "Transferir", para eliminar a necessidade de abrir o menu de 3 pontinhos.

## Escopo
Mudança apenas de UI/UX no cabeçalho da conversa. Nenhuma alteração em regras de negócio, banco de dados, Edge Functions ou permissões.

## Implementação

1. **Extrair o diálogo de encerramento**
   - Mover o estado `showCloseDialog` e o checkbox `generateSummary` de `ChatHeaderMenu.tsx` para `ChatHeader.tsx` (ou para um pequeno componente `CloseConversationDialog` compartilhado).
   - Garantir que o fluxo de encerramento continue igual: ao confirmar, chamar `closeConversation` com a flag `generateSummary` e, no sucesso, invalidar a lista de conversas.

2. **Adicionar o botão "Encerrar" no cabeçalho**
   - Em `src/components/chat/ChatHeader.tsx`, posicionar o novo botão imediatamente ao lado do botão "Transferir".
   - Usar o mesmo visual do botão "Transferir": `variant="outline"`, `size="sm"`, altura `h-7`, ícone + label.
   - Ícone: `CheckCircle` (do lucide-react).
   - Label: "Encerrar".
   - Condições de exibição:
     - A conversa deve existir e `conversation.status !== 'closed'`.
     - Respeitar `disabled={isReadOnlyView}`.
     - Desabilitar e mostrar spinner/texto "Encerrando..." quando `isClosing` for true.
   - Ao clicar, abrir o diálogo de confirmação.

3. **Ajustar o menu de 3 pontinhos**
   - Em `src/components/chat/ChatHeaderMenu.tsx`, remover a opção "Encerrar conversa" do menu.
   - Manter a opção "Reabrir conversa" quando a conversa já estiver encerrada.
   - Manter "Editar contato", "Arquivar conversa" e "Exportar conversa" no menu.

4. **Responsividade e consistência**
   - Manter o botão na faixa horizontal de ações existente, que já é scrollável em telas pequenas.
   - Garantir que o botão não quebre a linha em viewports estreitas.

5. **Validação**
   - Verificar que a ação de encerrar funciona para usuários com permissão de leitura/escrita na conversa.
   - Confirmar que, ao encerrar, a conversa some da lista de abertos e o diálogo fecha.
   - Garantir que a opção de reabrir continue acessível no menu de 3 pontinhos quando a conversa já estiver encerrada.

## Arquivos alterados
- `src/components/chat/ChatHeader.tsx`
- `src/components/chat/ChatHeaderMenu.tsx`

## Não alterar
- Lógica de encerramento (`useWhatsAppActions`).
- Permissões/RLS.
- Edge Functions.
- Outros menus ou cards.