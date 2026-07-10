# Diagnóstico: envio/recebimento parado

## O que eu verifiquei agora

1. **Logs da função `send-whatsapp-message`** (últimos minutos):
   ```
   Timeout: https://evolution-api-hbbv.srv1746890.hstgr.cloud/message/sendText/advocacia-ibipora não respondeu em 15s
   Timeout: .../instance/connectionState/advocacia-denison não respondeu em 15s
   Timeout: .../message/sendText/piscinas-ibipora não respondeu em 15s
   ```
   Três instâncias diferentes (Advocacia Ibiporã, Advocacia Denison e Piscinas Ibiporã) falhando com o **mesmo** erro de timeout.

2. **Teste direto do host da Evolution API** a partir do sandbox:
   ```
   https://evolution-api-hbbv.srv1746890.hstgr.cloud/  → timeout (sem resposta em 20s)
   https://srv1746890.hstgr.cloud/                     → timeout (sem resposta em 20s)
   ```
   Não é DNS, não é rota específica, não é `apikey`: o servidor inteiro (VPS `srv1746890.hstgr.cloud` na Hostinger) está **fora do ar**, recusando conexão TCP.

## Conclusão

**O problema não está na plataforma Lovable nem no banco.** A Evolution API — que é o serviço externo que efetivamente conversa com o WhatsApp — está inacessível. Enquanto ela não responder, nenhuma mensagem sai e nenhum webhook chega, independentemente de qualquer mudança de código aqui.

Isso explica os dois sintomas ao mesmo tempo:
- **Envio falha** porque a plataforma não consegue chamar `/message/sendText`.
- **Recebimento para** porque a Evolution é quem dispara os webhooks para nós; se ela está caída, não há evento nenhum para receber.

## Plano de ação

### 1. Restaurar o servidor Evolution (fora da Lovable, feito por você)
Entrar no painel da Hostinger (VPS `srv1746890`) e:
- Verificar se a VPS está ligada / com créditos ativos.
- Reiniciar a VPS ou o container/serviço da Evolution API (`docker ps`, `systemctl status evolution-api`, dependendo de como está instalada).
- Confirmar que `https://evolution-api-hbbv.srv1746890.hstgr.cloud/` volta a responder no navegador.

Só depois desse passo faz sentido testar a plataforma de novo.

### 2. Validar na plataforma assim que a Evolution voltar
- Abrir Configurações → Instâncias e clicar em **"Testar conexão"** em cada instância.
- Se alguma ficar em `connecting`/`close`, usar o botão **"Reconectar"** já existente.
- Enviar uma mensagem de teste em cada empresa (Advocacia Ibiporã, Advocacia Denison, Piscinas Ibiporã).

### 3. Melhoria opcional na plataforma (só depois que voltar)
Hoje, quando a Evolution demora >15s, a UI mostra um erro genérico. Posso deixar mais claro para o usuário final:
- Banner no topo da conversa quando **todas** as instâncias da empresa estão inacessíveis, com texto do tipo *"Servidor WhatsApp indisponível — envio temporariamente desativado"*.
- Substituir o toast "Falha ao enviar" por uma mensagem específica quando o erro for timeout de rede (diferenciar de "instância desconectada").
- Log estruturado por instância para facilitar diagnóstico futuro.

Essa melhoria não conserta o problema atual — só torna o próximo incidente mais fácil de entender. Me diga se quer que eu implemente depois que a Evolution estiver de pé.

## O que **não** vou fazer agora
- Não vou mexer em código de envio, webhook ou RLS: o backend da plataforma está funcionando corretamente; o problema é 100% do servidor externo.
- Não vou "reconectar instâncias" pela plataforma agora: sem a Evolution responder, qualquer reconexão também falharia.
