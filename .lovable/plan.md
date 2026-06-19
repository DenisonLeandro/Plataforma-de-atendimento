## Diagnóstico

A transcrição **não está quebrada por bug nem por limite de tamanho de áudio**. Os logs da edge function `transcribe-audio` mostram, repetidamente:

```
[transcribe-audio] AI gateway error 403
{"type":"credit_limit_reached","message":"Workspace credit limit reached",
 "details":"This workspace has reached its credit limit.
            Ask your workspace owner to adjust the workspace limit."}
```

O mesmo 403 aparece em `analyze-whatsapp-sentiment` e `categorize-whatsapp-conversation` — ou seja, **todo o Lovable AI Gateway está bloqueado por estouro de créditos do workspace**, não só a transcrição.

### Por que parou
- O modelo usado (`google/gemini-2.5-pro`) é o mais caro do catálogo Lovable AI e cada áudio consome bem mais crédito que texto.
- Quando o workspace atinge o teto de créditos, **todas** as chamadas ao gateway retornam 403 até alguém aumentar o limite ou os créditos renovarem.

### Sobre limite de tamanho do áudio
Não é a causa atual, mas vale registrar:
- A função baixa o áudio inteiro do Storage, converte para base64 e envia ao gateway numa única chamada. Não há limite explícito no nosso código.
- O modelo Gemini tem teto próprio de duração/tamanho de áudio; áudios muito longos (vários minutos) podem falhar com 400 do provedor, não com 403.
- A função roda em edge runtime com timeout padrão; áudios muito grandes também podem estourar tempo.

## Plano

### 1. Voltar a funcionar (ação do usuário, fora do código)
Não dá pra resolver via código — o bloqueio é de billing do workspace. Caminhos:
- **Aumentar o limite de créditos do workspace** no painel da Lovable (Workspace → Plans/Usage), ou
- **Esperar a renovação do ciclo** de créditos, ou
- **Fazer upgrade do plano**.

Enquanto isso, sentimento, categorização automática e transcrição vão continuar retornando erro.

### 2. Melhorias em `supabase/functions/transcribe-audio/index.ts` (para quando os créditos voltarem)

**a) Trocar o modelo padrão para um mais barato**
- Hoje: `google/gemini-2.5-pro` (caro) com fallback para `google/gemini-2.5-flash`.
- Proposto: usar `google/gemini-2.5-flash` como **primário** e `gemini-2.5-pro` apenas como fallback se a transcrição vier vazia. Reduz consumo de créditos em ~5–10x sem perda perceptível de qualidade para áudio de WhatsApp.

**b) Mensagem de erro clara quando for credit_limit_reached**
- Hoje o front recebe `ai error (403)` genérico.
- Detectar `type === "credit_limit_reached"` no corpo da resposta do gateway e retornar status 402 com mensagem específica ("Créditos de IA esgotados — peça ao admin do workspace para aumentar o limite"), para o toast da UI orientar.

**c) Pré-validação de tamanho do áudio**
- Checar o tamanho do `arrayBuffer` antes de mandar pro gateway. Se passar de ~20 MB (limite prático do Gemini para audio inline), marcar `transcription_status = 'failed'` com mensagem "áudio muito longo" e não gastar crédito numa chamada que vai falhar.

**d) Não re-tentar em 403/402**
- Hoje a UI pode disparar nova transcrição manual. Garantir que, ao receber 402/403, o status fique `failed` e o botão de "tentar de novo" só apareça em falhas transitórias (não em estouro de crédito).

### 3. Fora de escopo
- Não vou mexer em `analyze-whatsapp-sentiment` nem em `categorize-whatsapp-conversation` neste round, embora sofram do mesmo 403 — se quiser, faço o mesmo tratamento de erro depois.
- Não vou trocar o provedor de transcrição (ex.: OpenAI direto, ElevenLabs) — exigiria nova chave e mudança de billing.

## Detalhes técnicos

- Arquivo único alterado: `supabase/functions/transcribe-audio/index.ts`.
- Sem migrations.
- Sem alteração de UI nesta etapa (a UI já mostra toast de erro; só vai melhorar a mensagem).
