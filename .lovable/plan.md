# Disparo único: backfill-historical-media (amostragem limit=10)

## Ação
Invocar a edge function `backfill-historical-media` uma única vez via `supabase--curl_edge_functions`, usando a sessão autenticada do preview (token injetado automaticamente — você já está logado como admin `denisonhl@hotmail.com`).

**Request:**
- `path`: `/backfill-historical-media`
- `method`: `POST`
- `headers`: `{ "Content-Type": "application/json" }`
- `body`: `{"cursor":"0012f862-6bf8-487a-bcb1-5fbaac387149","limit":10}`

## Após o disparo
1. Reportar HTTP status code.
2. Reportar a resposta JSON completa (campos: `processed`, `succeeded`, `failed`, `skipped`, `next_cursor`, `done`, `remaining`) — sem resumir.
3. Buscar logs via `supabase--edge_function_logs` (search: `media-recovery` e `status`) e listar, por mensagem processada, o `status` + `reason` quando falha.

## Não fazer
- Não invocar a função novamente após esse disparo único.
- Não modificar código da função nem da pipeline.
- Não alterar nenhum dado no banco.
