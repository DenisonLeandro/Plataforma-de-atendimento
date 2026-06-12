## Problema

No diálogo "Transferir Conversa", o botão **Confirmar** existe no código (`AssignAgentDialog.tsx`, dentro do `DialogFooter`), mas em telas de altura reduzida (viewport atual ~502px) o conteúdo do diálogo ultrapassa a altura da janela:

- Header do diálogo
- `ScrollArea` com `max-h-[400px]` (lista de agentes)
- Campo "Motivo da transferência" (Textarea com 3 linhas)
- Footer com botões Cancelar / Confirmar

A soma fica maior que a tela e o `DialogContent` não tem limite de altura nem rolagem própria — o rodapé com o botão Confirmar é empurrado para fora da área visível, dando a impressão de que "não tem botão" e que a seleção deveria aplicar automaticamente.

## Correção (apenas visual/layout, sem mexer em lógica)

Editar **somente** `src/components/conversations/AssignAgentDialog.tsx`:

1. No `DialogContent`, adicionar:
   - `max-h-[90vh]`
   - `flex flex-col`
   - `overflow-hidden`
   
   Assim o diálogo nunca passa da altura da tela.

2. Na `ScrollArea` interna, trocar `max-h-[400px]` por `flex-1 min-h-0` para que ela ocupe o espaço restante e role internamente, mantendo header e footer sempre visíveis.

3. Garantir que `DialogFooter` fique fixo no fim (`shrink-0`), e o bloco do "Motivo" também (`shrink-0`).

Resultado: em qualquer altura de tela, o botão **Confirmar** fica sempre visível na parte inferior do diálogo, e a lista de agentes rola dentro da área central.

## Não será alterado

- Lógica de transferência (`useConversationAssignment`, `transferConversation`).
- Comportamento de seleção (continua exigindo clique em Confirmar — não vira automático).
- Lista de agentes, filtros, badges, status.
- Diálogo de Atribuir (mesmo componente, mesma correção visual beneficia ambos).
- Qualquer outro arquivo do projeto.

## Critério de aceitação

- Abrir "Transferir conversa" em tela baixa (ex.: 900x500) mostra o botão **Confirmar** sem precisar rolar a página.
- Selecionar Renata na lista → clicar Confirmar → transferência ocorre normalmente.
- Nenhuma outra função/visual é alterada.
