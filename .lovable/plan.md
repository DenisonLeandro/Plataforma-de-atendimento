Entendi. A resposta honesta é: se uma mensagem antiga nunca foi entregue pela Evolution/API para a plataforma e também não aparece mais no histórico consultável da instância, não existe como “inventar” essa mensagem depois. Mas dá para fazer duas coisas importantes:

1. tentar recuperar tudo que ainda estiver disponível na Evolution/WhatsApp;
2. mudar a arquitetura para que, daqui pra frente, a plataforma não perca mensagens mesmo quando mídia, IA, conexão ou banco falharem temporariamente.

## Plano proposto

### 1. Diagnóstico de recuperação das mensagens invisíveis
- Identificar as conversas que aparecem sem mensagens ou com histórico incompleto.
- Para cada conversa, consultar diretamente a Evolution API usando `findMessages` com os formatos possíveis de JID:
  - número real `@s.whatsapp.net`;
  - `@lid`;
  - variações com/sem nono dígito brasileiro;
  - conversas duplicadas/twins já existentes no banco.
- Separar o resultado em três grupos:
  - mensagens existem na Evolution e podem ser importadas;
  - mensagens existem só em conversa duplicada/local e podem ser fundidas;
  - mensagens não existem mais em nenhuma fonte disponível.

### 2. Recuperação do que ainda existir
- Criar/ajustar uma função de recuperação por conversa/instância.
- Reimportar mensagens encontradas com `upsert`, sem duplicar mensagens já salvas.
- Resolver automaticamente casos `@lid` quando houver conversa gêmea com o número real.
- Atualizar `last_message_at`, prévia, status e contador da conversa após a recuperação.
- Para mídias antigas, salvar a mensagem primeiro e deixar a mídia para uma etapa separada, para não perder texto por causa de falha no download do arquivo.

### 3. Blindagem do webhook para mensagens novas
Hoje o ponto mais perigoso é que o webhook processa tudo direto. Se a função demorar, se baixar mídia falhar, se der erro antes do insert, ou se a execução cair, a mensagem pode não ser persistida corretamente.

A correção estrutural será:
- Criar uma tabela de entrada bruta, por exemplo `whatsapp_webhook_events`, para armazenar todo payload recebido da Evolution antes de qualquer processamento.
- No webhook, gravar o evento bruto imediatamente e responder rápido.
- Processar a mensagem em segundo plano, com controle de status:
  - `pending`;
  - `processing`;
  - `processed`;
  - `failed`;
  - `dead_letter`.
- Usar chave idempotente por instância + evento + message_id, evitando duplicidade.
- Se qualquer etapa falhar, o payload original continua salvo e pode ser reprocessado.

### 4. Separar mensagem de mídia
Para garantir que texto/registro da mensagem não se perca:
- Salvar a mensagem no banco primeiro, mesmo que seja áudio, imagem, vídeo ou documento.
- Marcar mídia como `pending_media` quando o download falhar ou demorar.
- Criar retry/backfill de mídia em segundo plano.
- A tela pode mostrar “mídia em recuperação” em vez de parecer que a mensagem sumiu.

### 5. Reconciliação automática
Além do webhook, adicionar uma rotina de conferência:
- Periodicamente consultar as últimas mensagens de cada instância/conversa ativa na Evolution.
- Comparar com o banco local por `message_id`.
- Importar automaticamente qualquer mensagem faltante.
- Registrar lacunas que não puderem ser recuperadas.

Isso cobre casos em que:
- a Evolution não chamou o webhook;
- a função recebeu mas falhou no meio;
- a conexão caiu e voltou;
- houve duplicidade `@lid`/número real;
- mídia travou o processamento.

### 6. Tela/log administrativo de falhas
Adicionar visibilidade para você saber quando algo não chegou perfeito:
- mensagens/eventos com falha de processamento;
- tentativas de retry;
- mídia pendente;
- conversas com evento recebido mas sem mensagem renderizada;
- botão de “reprocessar falhas”.

## Resultado esperado

Depois disso, a plataforma passa a trabalhar com um modelo mais seguro:

```text
Evolution webhook recebido
        ↓
Evento bruto salvo imediatamente
        ↓
Processamento em segundo plano
        ↓
Mensagem salva primeiro
        ↓
Mídia/IA/transcrição/regras depois
        ↓
Retry automático se qualquer etapa falhar
```

## Limite real

Não dá para prometer 100% de recuperação de mensagens antigas que nunca foram entregues pela Evolution e que não estão mais disponíveis no histórico dela. Mas dá para garantir que, daqui pra frente, todo evento recebido fique salvo bruto antes de qualquer processamento, reduzindo muito o risco de mensagens sumirem da plataforma.