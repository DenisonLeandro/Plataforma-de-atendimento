## Diagnóstico (dados reais da Piscinas Ibiporã, code `F1EDE1`)

Rodei as queries. O que existe hoje para a instância `piscinas-ibipora`:

| Item | Total | Com `company_id` correto | Com `company_id` NULL |
|---|---|---|---|
| Conversas | 465 | **0** | 465 |
| Contatos | 3.619 | **0** | 3.619 |
| Mensagens | 3.764 | **0** | 3.764 |
| `agent_instance_access` | 0 | — | — |

**Causa raiz:** o webhook (`evolution-webhook`) e o `sync-whatsapp-history` gravam registros **sem preencher `company_id`**. Confirmei com `rg`: nenhum dos dois arquivos referencia `company_id`. Como o RPC `get_conversation_counters` e vários filtros usam `c.company_id = get_user_company_id(auth.uid())`, tudo é filtrado como "sem empresa" e some da UI. 

Isso é uma dívida da **Fase 1 Multi-Tenant**: adicionamos a coluna e migramos os dados existentes, mas não atualizamos as edge functions que criam registros novos. Toda instância adicionada depois da migração cai nesse buraco.

**Causa secundária:** os atendentes da Dom Piscinas/Piscinas Ibiporã não têm entrada em `agent_instance_access`. Sem isso, o `can_view_conversation` bloqueia agents mesmo com `company_id` correto. O admin (Lucas) veria via role admin, mas os atendentes não.

## Plano de correção

**1. Backfill imediato (migração SQL):**
- `UPDATE whatsapp_conversations SET company_id = i.company_id FROM whatsapp_instances i WHERE conv.instance_id = i.id AND conv.company_id IS NULL`
- Mesmo para `whatsapp_contacts` e `whatsapp_messages`
- Isso destrava as 465 conversas / 3.619 contatos / 3.764 mensagens da Piscinas Ibiporã **e** qualquer outra instância nova em situação equivalente.

**2. Prevenção definitiva (edge functions):**
- `evolution-webhook/index.ts`: ao inserir em `whatsapp_conversations`, `whatsapp_contacts`, `whatsapp_messages`, ler o `company_id` da `whatsapp_instances` (uma vez, cacheado no evento) e incluir no payload.
- `sync-whatsapp-history/index.ts`: mesma coisa nos chunks de upsert.
- Adicionar trigger de segurança (defense-in-depth): `BEFORE INSERT` nas 3 tabelas que preenche `company_id` a partir de `instance_id` caso venha NULL. Assim, qualquer function futura que esquecer também fica protegida.

**3. Ajuste de UX para atendentes:**
- Não posso criar `agent_instance_access` sozinho — depende de decisão do admin. Vou apenas deixar a explicação: o Lucas (admin da Piscinas Ibiporã) precisa ir em **Configurações → Equipe** e vincular cada atendente da empresa à instância `piscinas-ibipora`. Sem esse vínculo, atendente não vê conversa nenhuma (regra atual de segurança, correta).

## Arquivos afetados

- Nova migração SQL (backfill + trigger `set_company_id_from_instance`)
- `supabase/functions/evolution-webhook/index.ts`
- `supabase/functions/sync-whatsapp-history/index.ts`

## Verificação pós-fix

- Rodar `SELECT count(*) FROM whatsapp_conversations WHERE company_id IS NULL` → deve ser 0.
- Logar como Lucas e conferir se as 465 conversas aparecem.
- Vincular 1 atendente de teste em `agent_instance_access` e confirmar que ele passa a ver a lista.
