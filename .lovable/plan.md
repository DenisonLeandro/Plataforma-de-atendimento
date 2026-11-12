# Corrigir o botão "Recuperar mensagens" e destravar a Desenvol

## O que encontrei
- **O erro vermelho:** o botão "Recuperar mensagens agora" só aceita administradores e supervisores da própria empresa. A conta usada (super admin da plataforma, vendo a Desenvol) não tem nenhum desses papéis nem liberação para a Desenvol. O sistema recusa e a tela mostra só a frase genérica em inglês.
- **A Desenvol parou de receber:** os dois WhatsApps (Suporte 1 e Suporte 2) aparecem "Conectado", mas a última mensagem de cliente chegou ontem (Suporte 1 às 17:56, Suporte 2 às 14:38). Hoje não entrou nenhuma, igual ao print do cliente.

## O que vou fazer
1. **Liberar o botão de recuperar para o super admin**: recuperar mensagens só busca o que faltou, não desliga nada. Super admin poderá usar em qualquer empresa. Reconectar e gerar QR Code continuam com a regra atual.
2. **Mensagem de erro clara em português**: em vez de "Edge Function returned a non-2xx status code", mostrar o motivo real (ex.: "Você não tem permissão para esta empresa").
3. **Destravar a Desenvol agora**: reiniciar a conexão dos dois WhatsApps no servidor e rodar a recuperação das mensagens de hoje. Se continuar sem chegar nada, a tela vai pedir QR Code novo.
4. Conferir no banco se as mensagens de hoje (ex.: "Bom dia Rodrigo") entraram.

## Detalhes técnicos
- `watchdog-instances`: quando `instanceId` vier, aceitar `is_super_admin` antes de `authorizeInstanceAction`; manter auth atual para os demais.
- `InstanceCard.tsx` (recuperar e reconectar): ler `error.context.json()` do `FunctionsHttpError` e mostrar `error`.
- Deploy de `watchdog-instances`; `POST /instance/restart` nas instâncias `desenvol` e `desenvol-suporte`.
