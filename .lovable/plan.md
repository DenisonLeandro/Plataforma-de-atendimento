## Fase 1 — Diagnóstico (read-only)

### Fluxo do "Sincronizar histórico"
- **UI / disparo**: botão `Download` (ícone) em `src/components/settings/InstanceCard.tsx:154-164`, habilitado só quando `instance.status === 'connected'`. Confirma no `AlertDialog` (linhas ~204-218) → chama `handleSync` → `syncHistory.mutateAsync(instance.id)`.
- **Cliente / orquestrador**: `src/hooks/whatsapp/useSyncWhatsAppHistory.ts`. Faz `fetch` direto pra `…/functions/v1/sync-whatsapp-history` em loop (até 100 chunks ou 5 min), reaproveitando `next_cursor` retornado.
- **Edge function**: `supabase/functions/sync-whatsapp-history/index.ts`.
  1. Busca `whatsapp_instances` + `whatsapp_instance_secrets` (l. 310-330).
  2. `POST /chat/findContacts/{identifier}` em chunks de 75 (l. 346-418).
  3. `POST /chat/findChats/{identifier}` 1x (l. 422-442).
  4. Para cada chat (10 por invocação), `POST /chat/findMessages/{identifier}` paginado.
- Identifier: `instance_id_external` (Cloud) ou `instance_name` (self-hosted). "cinco-conjuntos" é `self_hosted` → usa `instance_name = "cinco-conjuntos"`.

### Estado da instância no banco
| campo | valor |
|---|---|
| `id` | `a369a4f6-f7e4-41c3-a80b-d03e2248fa76` |
| `instance_name` | `cinco-conjuntos` |
| `provider_type` | `self_hosted` |
| `status` | `connected` ✅ |
| `api_url` | `https://evolution-api-hbbv.srv1746890.hstgr.cloud` |
| `api_key` | 32 chars (presente) |

Sync atual:
- **975 contatos** importados (`findContacts` rodou OK).
- **0 conversas, 0 mensagens** (`findChats` retornou vazio ou os chats foram filtrados fora).

### Hipóteses
| # | Veredito | Razão |
|---|---|---|
| H1 status | ❌ | status=`connected`. |
| H5 RLS | ❌ | edge function usa service role; bypassa RLS. |
| H6 auth | ❌ parcial | `findContacts` (mesmo header) trouxe 975 → auth OK. |
| H7 nome divergente | ❌ | mesmo motivo de H6 — se nome fosse inválido, contatos também falhariam. |
| H4 filtro errado | ❌ | contatos foram gravados com o `instance_id` certo; o código de chats usa o mesmo identifier. |
| H3 timeout | parcial | 13 chunks de contatos (~25 s cada via `MAX_INVOCATION_MS`) = **2-3 min só de contatos** — explica o "fica carregando muito tempo". Mas após contatos, `findChats` retorna numa única chamada; se viesse populado, conversas apareceriam. |
| **H2 Evolution sem chats** | ✅ **vencedora** | Instância conectada via QR nova: Baileys/Evolution **não baixa histórico do WhatsApp**, só armazena chats conforme novas mensagens chegam. Os 975 contatos vêm do address book (sincronização separada). `findChats` retorna `[]` porque ninguém mandou mensagem ainda pra esse número. |

### Confirmação que o Denison pode rodar

```sql
-- Estado da instância
SELECT id, instance_name, provider_type, status, created_at
FROM whatsapp_instances
WHERE instance_name ILIKE '%cinco%';

-- Quantos chats/mensagens existem
SELECT
  (SELECT count(*) FROM whatsapp_conversations
    WHERE instance_id='a369a4f6-f7e4-41c3-a80b-d03e2248fa76') AS conversas,
  (SELECT count(*) FROM whatsapp_messages m
    JOIN whatsapp_conversations c ON c.id=m.conversation_id
    WHERE c.instance_id='a369a4f6-f7e4-41c3-a80b-d03e2248fa76') AS mensagens,
  (SELECT count(*) FROM whatsapp_contacts
    WHERE instance_id='a369a4f6-f7e4-41c3-a80b-d03e2248fa76') AS contatos;
```

Pra **provar** H2 sem mexer no código, Denison pode bater direto no Evolution (curl no terminal dele):

```bash
curl -X POST \
  https://evolution-api-hbbv.srv1746890.hstgr.cloud/chat/findChats/cinco-conjuntos \
  -H "apikey: <api_key da instância>" \
  -H "Content-Type: application/json" \
  -d '{"where":{}}'
```

Se voltar `[]` ou `{"records":[]}` → H2 confirmada. Se voltar lista, é outra coisa e a gente reabre.

### Por que as antigas funcionaram
- `advocacia-denison`, `sao-lourenco`, `maringa`, `advocacia-ibipora` já estão conectadas há **10+ dias**, recebendo mensagens. Evolution acumulou chats no cache do Baileys ao longo desse tempo — por isso `findChats` retorna populado.
- A "nova" não recebeu mensagens ainda (ou recebeu pouquíssimas) → cache do Baileys vazio → sync não tem o que importar.

### Plano de fix proposto (Fase 2 — aguarda OK)

1. **Curto prazo — UX honesta** (sem mudar lógica):
   - No `useSyncWhatsAppHistory`, distinguir resultado `chats_synced === 0 && contacts_synced > 0` e mostrar toast específico:
     *"Contatos importados ({n}). Nenhuma conversa disponível no Evolution ainda — o WhatsApp só envia histórico conforme novas mensagens chegam."*
   - Mudar copy do `AlertDialog` de sincronização explicando essa limitação.

2. **Médio prazo — encurtar o "carregando muito tempo"**:
   - Subir `CONTACTS_PER_INVOCATION` (75 → 200) ou pular sync de contatos quando o usuário só quer histórico de conversas (sync de contatos já roda noutros pontos).
   - Alternativa: rodar contatos + chats em ordem invertida (chats primeiro, contatos depois), pra o usuário ver as conversas aparecendo enquanto contatos terminam em background.

3. **Long shot (só se H2 não confirmar)**:
   - Investigar `chat/fetchChats` vs `chat/findChats` (algumas builds do Evolution expõem endpoints diferentes).
   - Forçar `?force=true` ou tentar `instance/fetchInstances` pra ver se o nome bate.

Nenhuma alteração em RLS, cor laranja, fluxo de criação de conversa ou config.toml. Sem migration. Sem deploy até OK.
