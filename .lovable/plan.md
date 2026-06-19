# Busca de conversas: filtrar globalmente, não só na página atual

## Problema

Hoje, ao digitar "fabio" na barra de pesquisa da sidebar de Conversas, nada aparece — mesmo existindo um contato Fabio salvo.

Causa: a busca é feita **apenas em memória**, sobre as 20 conversas da página atual (`useWhatsAppConversations` carrega `pageSize=20`). Se o Fabio estiver em outra página, ele simplesmente não está na lista que o filtro percorre. A busca por conteúdo de mensagem (`useWhatsAppMessageSearch`) também não ajuda nesse caso — ela só roda com 3+ caracteres e procura dentro de `whatsapp_messages.content`, não em nome/telefone do contato.

## Solução

Quando houver termo de busca, fazer a filtragem **no servidor**, cruzando `whatsapp_conversations` com `whatsapp_contacts` (nome/telefone), em vez de filtrar localmente.

### Mudanças

1. **`src/hooks/whatsapp/useWhatsAppConversations.ts`**
   - Aceitar `search` no `filters` (já está na interface, mas não é usado).
   - Quando `search` estiver preenchido:
     - Buscar primeiro os `contact_id`s que casam por nome ou telefone (`whatsapp_contacts.name ilike %q%` OR `phone_number ilike %q%`), com um limite generoso (ex.: 500).
     - Aplicar `.in('contact_id', ids)` na query principal e na query de count.
     - Também aceitar match por `last_message_preview ilike %q%` via `.or(...)` para preservar o comportamento atual de busca por preview.
   - Sem termo: comportamento atual inalterado.

2. **`src/components/conversations/ConversationsSidebar.tsx`**
   - Passar `search: debouncedSearchQuery` para `useWhatsAppConversations`.
   - Remover (ou simplificar) o filtro local `matchesQuickSearch`: agora o servidor já filtrou por nome/telefone/preview. Manter apenas a união com `messageSearchResults` (busca em histórico de mensagens) para conversas extras encontradas pelo conteúdo.
   - Resetar `currentPage` ao mudar `debouncedSearchQuery` (já é feito).

### Fora de escopo

- Não mexer em RLS, edge functions, ou na busca por conteúdo de mensagem.
- Não mudar UI/visual da barra de pesquisa nem dos resultados.
