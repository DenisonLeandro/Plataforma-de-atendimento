## Problema

No notebook (~1008px) com as duas barras laterais abertas, a coluna central do chat fica com ~330px. Os botões `Assumir`, `Transferir`, badge `Neutro`, `Analisar`, kebab e engrenagem consomem toda a linha, e o `min-w-0 + truncate` do nome reduz a área do contato a 0px — por isso só o telefone aparece. Esconder labels (feito antes) ajudou em 1280px, mas em 1008px ainda não cabe.

## Solução

Reorganizar o `ChatHeader` em **duas linhas** quando o espaço é apertado, sem precisar fechar as barras:

```text
┌──────────────────────────────────────────────┐
│ [avatar] Dani Cristina           [⋮] [⚙]    │  ← linha 1: identidade sempre legível
│          5543996264779                       │
├──────────────────────────────────────────────┤
│ [Assumir] [Transferir] [😐 Neutro] [Analisar]│  ← linha 2: ações, com scroll-x se faltar
└──────────────────────────────────────────────┘
```

### Mudanças (apenas `src/components/chat/ChatHeader.tsx`)

1. **Linha 1 (sempre visível):**
   - Avatar + bloco do nome/telefone/tópicos/QueueIndicator ocupam todo o espaço (`flex-1 min-w-0`).
   - À direita, somente os controles "globais": `ChatHeaderMenu` (kebab) e link de configurações.
   - O nome do contato deixa de competir com botões de ação → não some mais.

2. **Linha 2 (ações da conversa):**
   - Nova faixa abaixo da linha 1 com `Assumir`, `Transferir`, `SentimentCard`, `Analisar`.
   - Container com `flex flex-wrap gap-2` em telas pequenas e `flex-nowrap overflow-x-auto` em notebook (1024–1280px) para permitir rolar lateralmente sem cortar nada.
   - Mantém os labels já existentes (`hidden xl:inline`) — em telas grandes continua tudo numa única faixa horizontal.

3. **A partir de `xl` (≥1280px):** opcionalmente colapsar de volta para layout de uma linha (nome à esquerda, ações à direita), já que aí cabe sem cortar. Implementado com classes responsivas (`xl:flex-row xl:items-center`) no wrapper externo, sem JS.

### Fora do escopo

- Não mexer em `ConversationsSidebar`, `ConversationDetailsSidebar` nem `WhatsApp.tsx`. As barras permanecem como o usuário quer.
- Sem alteração de lógica/estado/permissões — apenas reorganização visual.
- Sem mudar comportamento dos botões.

### Validação

- Conferir em 1008×577 (atual) com as duas sidebars abertas: nome "Dani Cristina" visível acima do telefone, ações em segunda linha rolável.
- Conferir em ≥1280px: layout volta a ser de linha única, igual ao desktop original.
- Conferir mobile: ações já caem em segunda linha via `flex-wrap`.
