
## Diagnóstico

A conexão com a Evolution API está **funcionando normalmente**. Verifiquei o banco e a função `evolution-webhook`:

- A instância `Advocacia` (`advocacia-denison`) está com `status = 'connected'` no banco (atualizada às 13:42:36).
- O webhook da Evolution está recebendo eventos normalmente (`messages.upsert`, `messages.update`, etc.) e gravando mensagens/conversas com sucesso.
- Existe **1 conversa** real no banco (contato "Claudio Miguel", última mensagem às 13:43:11), mas a UI mostra "Nenhuma conversa ainda".
- O perfil logado (Denison) é `admin` e aprovado, então as policies de RLS liberam tudo.

### Causa raiz

A **publicação `supabase_realtime` está vazia** — nenhuma tabela foi adicionada a ela:

```
select tablename from pg_publication_tables where pubname='supabase_realtime';
-- (0 rows)
```

Consequência:

1. **Banner "Instância Desconectada" travado** — `useInstanceStatusMonitor` faz um `SELECT` inicial das instâncias `disconnected` e depois depende de eventos Realtime de `UPDATE` em `whatsapp_instances` para limpar. Como não chega nenhum evento, quando a instância reconecta **o banner nunca some** até dar refresh manual na página.
2. **Lista "Nenhuma conversa ainda"** — quando a página foi aberta ainda não havia conversa. O `useWhatsAppConversations` assina `postgres_changes` em `whatsapp_conversations`, mas como a tabela não está na publicação Realtime, o `INSERT` da nova conversa criada pelo webhook **não dispara invalidação** da query. Só refrescando a página é que a conversa aparece.

Ou seja: os dados estão certos no backend, mas o frontend não está sendo notificado das mudanças.

## Plano

Criar uma migration que adiciona as tabelas relevantes à publicação `supabase_realtime` e garante `REPLICA IDENTITY FULL` (para os hooks receberem `old` + `new` em updates, usado por `useInstanceStatusMonitor` para detectar transição `disconnected → connected`).

### Tabelas a adicionar

- `whatsapp_instances` — corrige o banner travado e o monitor de status.
- `whatsapp_conversations` — corrige a lista de conversas e contadores em tempo real.
- `whatsapp_messages` — para o `ChatArea` receber mensagens novas em tempo real sem precisar refrescar.
- `whatsapp_contacts` — para atualizações de nome/foto refletirem na UI.

### Detalhes técnicos

```sql
ALTER TABLE public.whatsapp_instances     REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages      REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_contacts      REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.whatsapp_instances,
  public.whatsapp_conversations,
  public.whatsapp_messages,
  public.whatsapp_contacts;
```

Não é preciso mexer em código de hook nem em RLS — as policies atuais já filtram corretamente o que cada usuário pode ver via Realtime.

### Validação após aplicar

1. Recarregar a página `/whatsapp`. O banner "Instância Desconectada" deve sumir (a instância está `connected` no banco).
2. A conversa do Claudio Miguel deve aparecer na lista.
3. Enviar uma nova mensagem pelo WhatsApp e confirmar que ela aparece sem precisar refrescar.
4. Desconectar/reconectar a instância e confirmar que o banner reage em tempo real.
