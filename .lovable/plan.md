## Problema

A instância **Advocacia Ibiporã** está marcada como desconectada porque a `api_url` salva em `whatsapp_instance_secrets` aponta para a interface web do Evolution Manager, não para a API:

- Atual: `https://evolution-api-hbbv.srv1746890.hstgr.cloud/manager`
- Correta: `https://evolution-api-hbbv.srv1746890.hstgr.cloud`

Os logs da edge function `test-instance-connection` confirmam: a resposta vem como HTML (`<title>Evolution Manager</title>`), então o status fica como `disconnected` mesmo o WhatsApp estando conectado de fato no servidor.

## Correção

1. Atualizar `whatsapp_instance_secrets.api_url` da instância `advocacia-ibipora` removendo o sufixo `/manager`.
2. Rodar `test-instance-connection` para revalidar e atualizar o `status` em `whatsapp_instances`.
3. Confirmar via logs que a resposta agora retorna JSON com `state: "open"`.

## Prevenção (opcional, recomendado)

Em `AddInstanceDialog.tsx` e `EditInstanceDialog.tsx`, normalizar o input da `api_url` no momento de salvar:
- Remover automaticamente sufixos `/manager`, `/manager/`, barras finais.
- Exibir hint abaixo do campo: "Use a URL base do Evolution (ex.: `https://seu-servidor.com`), sem `/manager`."

Isso evita o mesmo erro em futuras instâncias self-hosted.

## Fora de escopo

- Nenhuma mudança em RLS, autenticação, regras de atribuição, acesso a instâncias ou ErrorBoundary.
- Nenhuma alteração nas outras instâncias já configuradas corretamente.
