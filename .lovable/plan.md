## Plano

Encerrar em massa **144 conversas ativas** da instância `piscinas-ibipora` cuja última atividade foi anterior a **29/06/2026 00:00 (horário de Brasília)**. As **37 conversas** com atividade em 29/06 ou depois permanecem `active`.

Critério exato:  
`instance_id = piscinas-ibipora AND status = 'active' AND COALESCE(last_message_at, updated_at) < '2026-06-29 00:00:00-03'`  
→ `status = 'closed'`

Só um `UPDATE` em `whatsapp_conversations`. Nenhuma alteração de código.
