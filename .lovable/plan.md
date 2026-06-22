## Status do sync em andamento (cinco-conjuntos)

Pelos network requests dos últimos ~50s, o sync está **funcionando normalmente**, só demorado:

| Chunk | cursor depois | contacts_synced | chats_synced |
|---|---|---|---|
| 1 | 450 | 75 | 0 |
| 2 | 525 | 75 | 0 |
| 3 | 600 | 75 | 0 |
| 4 | 675 | 75 | 0 |
| 5 | 750 | 75 | 0 |

`continued: true` em todos → o loop client-side segue chamando. Faltam ~3 chunks (~40s) pra terminar os contatos (total estimado ~975).

Conversas seguem zero — comportamento esperado por H2 (Evolution sem cache de chats pra instância recém-conectada).

## O que proponho como próximo passo

1. **Esperar o sync terminar** (mais ~40s). Quando `contacts_done: true` e `findChats` rodar, o toast novo deve disparar: *"Contatos importados (N). Nenhuma conversa disponível…"*
2. **Validar no banco** (read-only) que os contatos foram persistidos:
   ```sql
   SELECT count(*) FROM whatsapp_contacts
   WHERE instance_id='a369a4f6-f7e4-41c3-a80b-d03e2248fa76';
   ```
3. **Confirmar H2 via curl** no Evolution (Denison roda local):
   ```bash
   curl -X POST \
     https://evolution-api-hbbv.srv1746890.hstgr.cloud/chat/findChats/cinco-conjuntos \
     -H "apikey: <api_key>" \
     -H "Content-Type: application/json" \
     -d '{"where":{}}'
   ```
   Se retornar `[]` → H2 confirmada, não há nada a "corrigir" no nosso lado além do UX já aplicado.

## Decisão pendente

Quer que eu também avance a **Fase 2 médio prazo** (subir `CONTACTS_PER_INVOCATION` de 75 → 200 pra cortar o tempo de espera de 2-3 min pra ~1 min)? Sem mexer em RLS, sem mexer em chats, só ajuste de batch size em `supabase/functions/sync-whatsapp-history/index.ts`.

Sem alteração de código nesta etapa — aguardo OK.
