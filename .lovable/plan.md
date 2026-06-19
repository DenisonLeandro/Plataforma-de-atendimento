## Deploy de 4 Edge Functions

Deploy das funções abaixo a partir do código local (sincronizado com GitHub origin/main, commits c2e548b e 9d68164):

1. `evolution-webhook` — sobrescreve versão em produção
2. `sync-whatsapp-history` — sobrescreve versão em produção
3. `fetch-message-media` — sobrescreve versão em produção
4. `backfill-historical-media` — criada do zero (nova)

### Execução

Uma única chamada a `supabase--deploy_edge_functions` com as 4 funções.

### Pós-deploy — relatório

- Status (success/failed) por função
- Confirmação de que `backfill-historical-media` aparece na lista de Edge Functions
- Timestamp do "Last updated" pós-deploy de cada uma (via `supabase--project_info` ou equivalente)
- Erros/warnings do processo

### Não faremos

- Nenhuma invocação das funções (especialmente `backfill-historical-media`)
- Nenhuma alteração de código nas funções
- Nenhuma alteração de schema/DB
