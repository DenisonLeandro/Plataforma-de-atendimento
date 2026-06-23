# Mostrar `instance_name` no card da lista de conversas

## Fase 1 — Diagnóstico

**Card da lista:** `src/components/conversations/ConversationItem.tsx`

**Onde o agente é renderizado hoje** (linhas 205–216, coluna meta à direita, abaixo do timestamp):

```tsx
{conversation.assigned_to && conversation.assigned_profile?.full_name && (
  <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-muted text-muted-foreground text-[11px] font-medium max-w-[90px]">
    <User className="h-2.5 w-2.5 shrink-0" />
    <span className="truncate">
      {conversation.assigned_profile.full_name.split(" ")[0]}
    </span>
  </span>
)}
```

**De onde vem o dado do agente:** hook `src/hooks/whatsapp/useWhatsAppConversations.ts` (linha 75), via select com join:
```ts
.select(`*, contact:whatsapp_contacts(*), assigned_profile:profiles(id, full_name, avatar_url)`)
```

**Instância:** a conversa já tem `instance_id` (FK para `whatsapp_instances`), mas o `instance_name` **não é trazido** hoje. Tabela `whatsapp_instances` possui a coluna `instance_name` (ex: `cinco-conjuntos`). Solução: adicionar mais um join no mesmo select — sem novo hook, sem migration.

## Fase 2 — Mudança proposta (cirúrgica, 2 arquivos)

### 1. `src/hooks/whatsapp/useWhatsAppConversations.ts`
Adicionar join de instância no select (linha 75):
```ts
.select(`
  *,
  contact:whatsapp_contacts(*),
  assigned_profile:profiles(id, full_name, avatar_url),
  instance:whatsapp_instances(instance_name)
`)
```
Estender o tipo `ConversationWithContact` com `instance?: { instance_name: string } | null`.

### 2. `src/components/conversations/ConversationItem.tsx`

- Estender o tipo local `Conversation` com `instance?: { instance_name: string } | null`.
- Substituir o bloco do badge do agente (linhas 208–216) por um único badge que:
  - Mostra `<User/> Agente · instance-name` se houver agente + instância.
  - Mostra `<User/> Agente` se só houver agente.
  - Mostra `instance-name` (sem ícone de user) se só houver instância e nenhum agente.
  - Não renderiza nada se nenhum dos dois existir.
- Aumentar `max-w` do badge (de `max-w-[90px]` para algo como `max-w-[160px]`) já que agora cabe mais texto, mantendo `truncate`.
- Mesma classe visual (`bg-muted text-muted-foreground text-[11px] font-medium`), separador literal `" · "`.

Esboço:
```tsx
{(conversation.assigned_profile?.full_name || conversation.instance?.instance_name) && (
  <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-muted text-muted-foreground text-[11px] font-medium max-w-[160px]">
    {conversation.assigned_profile?.full_name && (
      <User className="h-2.5 w-2.5 shrink-0" />
    )}
    <span className="truncate">
      {[
        conversation.assigned_profile?.full_name?.split(" ")[0],
        conversation.instance?.instance_name,
      ].filter(Boolean).join(" · ")}
    </span>
  </span>
)}
```

A condição existente logo acima (linha 199 `{(!conversation.assigned_to || showStatusBadge) && ...}`) **não é alterada** — continua mostrando QueueIndicator quando não há agente.

## Restrições respeitadas

- Sem mexer em RLS, `can_view_conversation`, `can_access_conversation`, `can_user_see_instance` — o join roda sob as policies de SELECT já existentes de `whatsapp_instances` (Regra 2/3 garantem que, se a conversa aparece, a instância dela também é visível).
- Sem migration, sem mudança de schema, sem coluna nova.
- Sem tocar em `useCreateConversation.ts`, ChatHeader, MessageBubble ou outros componentes.
- Cor laranja intocada (uso de `bg-muted` semântico, igual ao atual).
- Apenas 2 arquivos alterados.

## Aparência final (descrição)

Coluna meta à direita do card continua com timestamp em cima e um único pill cinza embaixo:
- Com agente + instância: `👤 Danielle · cinco-conjuntos`
- Sem agente, com instância: `cinco-conjuntos`
- Sem nada: pill não renderiza (igual hoje).

## Aguardando OK para implementar.
