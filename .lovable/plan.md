# Plano de performance — reduzir lentidão da plataforma

O gargalo tem duas causas independentes. Atacamos as duas em paralelo: engenharia (índices + queries) resolve a raiz; upgrade de compute dá fôlego imediato para o pico de conexões.

## 1. Índices no banco (ganho maior, custo zero)

As 3 queries mais lentas hoje varrem tabelas grandes sem índice adequado. Criar:

- `whatsapp_conversations (company_id, last_message_at DESC NULLS LAST)` — cobre a listagem principal de conversas, que hoje leva ~3,3s por chamada (7.806 execuções).
- `whatsapp_conversations (company_id, status, last_message_at DESC)` — cobre os filtros "abertas/encerradas".
- `whatsapp_contacts (company_id)` + índice **trigram** (`pg_trgm`) em `name` e `phone_number` — a busca com `ilike '%texto%'` hoje faz seq scan (~4,7s). Trigram faz o `ilike` usar índice de verdade.
- `whatsapp_messages (conversation_id, timestamp DESC)` — se ainda não existir; acelera abertura da conversa.

Impacto esperado: queda de segundos para dezenas de milissegundos nas queries dominantes → menos conexões presas → menos saturação.

## 2. Reduzir peso da listagem de conversas no frontend

A query pesada traz `contact`, `assigned_profile` e `instance` inteiros via `LATERAL`. Ajustes:

- Selecionar só as colunas usadas no card (`select` explícito em vez de `*`).
- Manter `staleTime` alto no React Query (já está em 60s) e evitar refetch em foco para telas de listagem.
- Confirmar paginação (limit) em vez de puxar todas as conversas de uma vez.

## 3. Aumentar o limite de conexões (fôlego imediato)

Hoje: **52 de 60 conexões usadas** — muito perto do teto. Qualquer pico gera fila e timeouts (17 mil transações revertidas desde o boot).

Isso não se resolve por código: o limite de conexões é definido pelo tamanho da instância do Lovable Cloud. Caminho:

- Abrir **Backend → Configurações avançadas → Upgrade instance** e escolher um tamanho maior.
- Instâncias maiores sobem tanto o limite de conexões quanto CPU/RAM disponível para o Postgres.
- O upgrade leva alguns minutos e afeta o uso/cobrança do Lovable Cloud (o próprio painel mostra os valores antes de confirmar).

Se preferir, na fase de implementação eu abro o seletor de tamanho direto no chat para você aprovar.

## Ordem de execução sugerida

1. Migration com todos os índices (aplicação em segundos, sem downtime).
2. Ajuste do `select` da listagem de conversas.
3. Avaliar métricas por 10–15 min; se conexões continuarem >80%, fazer o upgrade da instância.

## Detalhes técnicos

- Trigram exige `CREATE EXTENSION IF NOT EXISTS pg_trgm;` antes dos índices `gin (... gin_trgm_ops)`.
- Todos os `CREATE INDEX` rodarão dentro da migration (sem `CONCURRENTLY`), então haverá um lock curto por tabela — aceitável no volume atual (643 MB).
- Nenhuma mudança de RLS ou de schema de negócio; só índices e ajuste de `select`.
