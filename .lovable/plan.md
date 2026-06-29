## Tarefa

Na edge function `supabase/functions/send-whatsapp-message/index.ts`, adicionar `console.warn` dentro de dois blocos `catch` vazios para evitar silenciamento de erros.

### Alterações exatas

1. **Linha 136** — catch do `JSON.parse` do estado da conexão:
   - ANTES: `catch {}`
   - DEPOIS: `catch (e) { console.warn('[send-whatsapp-message] Falha ao parsear estado da conexão:', e); }`

2. **Linha 223** — catch do bloco de reconexão:
   - ANTES: `catch {}`
   - DEPOIS: `catch (e) { console.warn('[send-whatsapp-message] Falha no bloco de reconexão:', e); }`

### Restrições

- Só adicionar `console.warn` dentro dos catches vazios. Nada mais.
- Não alterar lógica de envio, reconexão, headers ou qualquer outro comportamento.
- Não alterar `can_user_see_instance`, `can_access_conversation`, `can_view_conversation`.
- Não adicionar bypass de supervisor.

### Deploy

Após a mudança, realizar o deploy da edge function `send-whatsapp-message`.