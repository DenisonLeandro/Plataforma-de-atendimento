## Problema
No card da conversa, mostramos só o **primeiro nome** do agente atribuído (`full_name.split(" ")[0]`). Como temos **Maria Inês** e **Maria Angélica**, ambas aparecem como "Maria" e ficam indistinguíveis.

## Solução
Adicionar um campo opcional `display_name` em `profiles` que, quando preenchido, é usado no lugar do primeiro nome em qualquer lugar que hoje mostra o "primeiro nome" do agente. Quando vazio, mantém o comportamento atual (primeiro nome do `full_name`).

Para resolver o caso imediato, já definimos `display_name = 'Inês'` para a Maria Inês na própria migração.

## Mudanças

**Banco (migração)**
- Adicionar coluna `display_name text` em `public.profiles`.
- Setar `display_name = 'Inês'` no perfil da Maria Inês.

**Frontend**
- `useWhatsAppConversations.ts`: incluir `display_name` no select do `assigned_profile`.
- `ConversationItem.tsx`: usar `assigned_profile.display_name || assigned_profile.full_name.split(" ")[0]`.
- (Opcional, mesma sessão) Permitir editar o "Nome de exibição" no `ProfileModal.tsx`, para que cada agente ajuste sozinho no futuro.

## Fora do escopo
Não muda nada no `full_name` real, nas atribuições, RLS, webhooks, ou em telas de Configurações/Time (continuam mostrando o nome completo).
