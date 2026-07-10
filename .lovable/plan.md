## Diagnóstico

O Leonardo é supervisor da empresa "Denison Leandro Advocacia" e tem acesso pleno à instância **Advocacia Ibiporã**. As mensagens **estão chegando normalmente** no banco (71 nas últimas 24h, 24 nas últimas 2h).

O problema: **565 das 566 conversas dessa instância estão com status `closed`** e apenas 1 está `active`. Quando um contato manda mensagem nova, a mensagem é salva mas a conversa **continua fechada**, então não aparece na aba "Abertos" do Leonardo.

### Por quê?

No pedido anterior da **Piscinas Ibiporã**, você pediu para remover o "auto-reopen" (reabrir conversa automaticamente quando o cliente responde). Isso foi aplicado **globalmente** no `evolution-webhook`, o que quebrou o comportamento esperado na Advocacia — lá o Leonardo espera que uma mensagem nova de um cliente reabra a conversa e apareça em "Abertos".

## Correção proposta

Tornar o comportamento **configurável por empresa** via `project_config`:

1. **Migração SQL**
   - Adicionar coluna `company_id uuid` em `project_config` (com índice único `(company_id, key)`) para permitir configuração por empresa.
   - Inserir chave `auto_reopen_on_inbound` = `true` para todas as empresas (padrão).
   - Definir `auto_reopen_on_inbound` = `false` apenas para **Piscinas Ibipora** (mantém o comportamento pedido anteriormente).
   - Reabrir imediatamente as conversas da **Advocacia Ibiporã** que receberam mensagem inbound nas últimas 48h (para o Leonardo já ver o que caiu).

2. **`supabase/functions/evolution-webhook/index.ts`**
   - Em `findOrCreateConversation`, quando a conversa existir e a mensagem for **inbound** (`isFromMe = false`) e o status for `closed`, ler `project_config.auto_reopen_on_inbound` da empresa dona da instância. Se `true`, atualizar a conversa para `status = 'active'`. Se `false`, deixar como está.
   - Mensagens **outbound** (enviadas pela plataforma ou pelo próprio celular do atendente) não reabrem.

3. **Sem mudança de UI.** Nenhuma tela nova; se no futuro quiser um toggle nas configurações da empresa, é rápido adicionar depois.

## Detalhe técnico

- `project_config` hoje é global (sem `company_id`). A migração adiciona a coluna, permite `NULL` para chaves globais existentes (`require_account_approval`, `project_url`, `anon_key`) e usa `company_id NOT NULL` para chaves por empresa. Índice único parcial: `(key) WHERE company_id IS NULL` e `(company_id, key) WHERE company_id IS NOT NULL`.
- RLS: leitura autenticada por qualquer usuário da empresa; escrita restrita a admin da empresa (ou super_admin com acesso).
- Nenhum impacto em Piscinas — a chave para essa empresa fica `false`, mantendo o comportamento atual (conversas encerradas continuam encerradas).