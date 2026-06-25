## Diagnóstico (Centro)

As duas conversas em questão estão sem mensagens porque o `phone_number` salvo é um **@lid** (ID interno do WhatsApp), não um telefone real. As mensagens reais foram persistidas na conversa "gêmea" com o JID verdadeiro (`@s.whatsapp.net`):

| Conversa exibida | phone (lid) | msgs | Gêmea encontrada |
|---|---|---|---|
| "Sem nome" (170128050270242) | 170128050270242 | 0 | **Diego Onishe** — 5543996903225 (3 msgs, mesmo preview/timestamp) |
| "Márcia" | 57724494684296 | 0 | não localizada localmente (precisa consulta na Evolution) |

Por isso o card abre vazio — não há nada em `whatsapp_messages` apontando para essas linhas.

## Plano

### 1. Edge function `resolve-lid-conversations`
Nova função (admin-only) que, para uma instância:
- Lista conversas onde `phone_number` parece @lid (numérico com 14+ dígitos e sem msgs, ou flag em `metadata`).
- Para cada uma, chama Evolution `POST /chat/whatsappNumbers/{instance}` ou `GET /chat/findContacts` para resolver `lid → jid` real.
- Se resolvido:
  - **Se já existe conversa gêmea** com o telefone real na mesma instância → faz merge: move `whatsapp_messages`, `whatsapp_reactions`, `conversation_assignments`, `notes`, `summaries` para a gêmea; copia `assigned_to`/`status`/`unread` se a órfã estiver mais recente; deleta a órfã e o contato lid.
  - **Se não existe gêmea** → atualiza `whatsapp_contacts.phone_number` para o JID real e mantém a conversa (continua sem msgs, mas com número correto para responder).
- Retorna relatório (resolvidas, merges, não-resolvidas).

### 2. Botão de UI (admin) no card da instância
Em `InstanceCard.tsx` adicionar item no menu "⋮" → **"Resolver conversas @lid"** que chama a função e mostra toast com o resultado.

### 3. Ação imediata para essas 2 conversas
Após deploy, rodar a função para a instância "Advocacia Centro":
- "Sem nome" 170128050270242 deve fundir em **Diego Onishe** (preview e timestamp batem) → ao abrir Diego você verá a mensagem "Obrigado pelo retorno. Sucesso." e demais.
- "Márcia" 57724494684296 → tentar resolver via Evolution. Se a Evolution não devolver o JID real (instância nova, sem cache do lid), a conversa permanece sem msgs históricas, mas o número fica correto para responder.

### 4. Prevenção (próxima fase, fora deste plano)
Em `evolution-webhook` rejeitar/normalizar `remoteJid` terminado em `@lid` antes de criar contato — usa Evolution `whatsappNumbers` para resolver JID real na hora. (Posso incluir agora se quiser.)

## Detalhes técnicos
- Tabela afetada por merge: `whatsapp_messages` (UPDATE conversation_id), `whatsapp_reactions`, `conversation_assignments`, `whatsapp_conversation_notes`, `whatsapp_conversation_summaries`, `whatsapp_sentiment_*`, `whatsapp_message_edit_history`.
- Conflitos de `unique(conversation_id, message_id)` resolvidos com `ON CONFLICT DO NOTHING` + delete na órfã.
- Endpoint Evolution: `POST {url}/chat/whatsappNumbers/{instance}` com `{ numbers: [lid] }` ou `GET /chat/findChats/{instance}?where=...` — função tenta os dois fallbacks.
- Toda lógica em service-role; UI restrita a `admin`.

Confirma que prossigo, e se quero **incluir a prevenção (item 4)** no mesmo build?
