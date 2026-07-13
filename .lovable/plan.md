Diagnóstico encontrado:
- A transcrição em si está funcionando quando há crédito: encontrei chamadas recentes com sucesso para `openai/gpt-4o-mini-transcribe`.
- As falhas recentes principais são `402` no Gateway de IA, ou seja: o limite diário de créditos de IA do workspace chegou a `0 / 5` no período atual.
- A plataforma está salvando esses casos como `failed`, então o usuário vê “erro de transcrição” genérico, mesmo quando o problema real é limite diário/credito esgotado.
- Também há risco de tentativas repetidas automáticas consumirem crédito rapidamente quando muitos áudios chegam juntos.

Plano de correção:

1. Melhorar o backend de transcrição
- Atualizar a função `transcribe-audio` para diferenciar falhas por tipo:
  - `credits_exhausted` quando o Gateway retornar `402`.
  - `rate_limited` quando retornar `429`.
  - `invalid_audio` quando o áudio realmente for inválido/não suportado.
  - `media_unavailable` quando o arquivo do áudio não puder ser baixado.
- Salvar o motivo técnico em `metadata.transcription_error` no próprio registro da mensagem.
- Não marcar falta de crédito como erro genérico; marcar como estado pausado/recuperável.

2. Melhorar a interface do player de áudio
- Atualizar `AudioMessagePlayer.tsx` para mostrar mensagens corretas:
  - “Limite diário de IA atingido. Tente novamente quando renovar.”
  - “Muitas tentativas agora. Tente novamente em alguns segundos.”
  - “Formato de áudio não suportado.”
- Evitar toast genérico “Falha ao transcrever áudio” quando o backend já retorna uma causa clara.

3. Evitar repetição automática desnecessária
- Manter auto-transcrição para áudio novo sem status.
- Não repetir automaticamente áudios com `credits_exhausted`, `rate_limited`, `invalid_audio` ou `audio_too_large`.
- Permitir tentativa manual pelo botão quando for recuperável.

4. Recuperar os áudios recentes que ficaram marcados errado
- Atualizar os áudios recentes com `transcription_status = failed` causados por falta de crédito para `credits_exhausted`, mantendo-os prontos para nova tentativa manual quando o limite renovar.
- Não reprocessar todos automaticamente para evitar novo estouro de crédito.

Resultado esperado:
- O usuário verá o motivo real da falha.
- A plataforma não vai parecer “quebrada” quando o limite diário de IA acabar.
- Áudios válidos continuarão transcrevendo normalmente quando houver crédito disponível.
- Menos tentativas desnecessárias e menos consumo acidental de créditos.