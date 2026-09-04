# Adicionar ação de desarquivar conversa

## Problema
Hoje não existe uma forma de **desarquivar** uma conversa pela interface. O status `archived` só pode ser revertido para `active` manualmente no banco. Quando o usuário filtra por "Arquivadas" e abre uma conversa, o menu de 3 pontos ainda mostra "Arquivar conversa" (o que não faz sentido, pois já está arquivada) e não há botão de reabrir/desarquivar.

## Objetivo
Permitir que qualquer usuário com acesso à conversa a desarquive diretamente pela UI, voltando o status para `active` e fazendo ela reaparecer na lista normal.

## Escopo
- Frontend apenas: hook de ação, botão no cabeçalho do chat e itens de menu.
- Nenhuma migration de banco.

## Plano de implementação

### 1. Hook `useWhatsAppActions.ts`
Adicionar mutation `unarchiveConversation` que atualiza `whatsapp_conversations.status` para `'active'` (sem zerar `unread_count`, pois a conversa pode ter mensagens não lidas quando foi arquivada). Incluir otimistic update e invalidação do cache de conversas.

### 2. Cabeçalho do chat (`ChatHeader.tsx`)
Quando `conversation.status === 'archived'`, exibir botão **"Desarquivar"** com ícone `ArchiveRestore` ao lado do botão "Encerrar". Ao clicar, chamar `unarchiveConversation` e, no sucesso, fechar o diálogo de confirmação e atualizar a lista.

### 3. Menu de 3 pontinhos (`ChatHeaderMenu.tsx`)
- Mostrar **"Desarquivar conversa"** quando `status === 'archived'`.
- Esconder **"Arquivar conversa"** quando já estiver arquivada.
- Manter "Reabrir conversa" para `status === 'closed'`.

### 4. Menu de clique direito na lista (`ConversationItemMenu.tsx`)
- Quando `status === 'archived'`, trocar o item "Arquivar" por **"Desarquivar"** com ícone `ArchiveRestore`.
- Quando `status !== 'archived'`, manter "Arquivar".

### 5. Comportamento após desarquivar
- Toast de sucesso: "Conversa desarquivada com sucesso".
- Invalidar query key `['whatsapp', 'conversations']` para a lista atualizar.
- Se a conversa estiver aberta no painel direito, ela continua aberta e o cabeçalho passa a mostrar as ações normais (`active`).

## Critérios de aceitação
- Usuário consegue abrir uma conversa arquivada e ver um botão "Desarquivar" no cabeçalho.
- Usuário consegue usar o menu de 3 pontinhos ou clique direito para desarquivar.
- Após desarquivar, a conversa volta ao status `active` e reaparece na lista padrão.
- Botão/ícone de arquivar não é mostrado para conversas já arquivadas.
