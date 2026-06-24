## O que aconteceu

Quando você clicou em **Reconectar**, a função chamou `GET /instance/connect/{id}` do Evolution. Esse endpoint, em instâncias **já conectadas**, devolve um payload sem QR Code (e às vezes com `code/base64` vazios), mas no meu código eu fiz dois erros:

1. **Sempre marquei o status como `connecting`** no banco, mesmo quando a instância estava `open` no Evolution. Por isso a plataforma agora mostra "Conectando".
2. **A mensagem "Sessão expirada — gere o QR Code"** foi disparada baseada num campo que vinha vazio, sem checar o estado real da instância. Foi um falso alarme.

A instância está conectada no Evolution — só nossa UI está mostrando errado por causa do status que eu mesmo escrevi.

## Plano de correção

### 1. `reconnect-instance` checa o estado ANTES de forçar reconexão
- Primeiro chama `GET /instance/connectionState/{id}`.
- Se vier `open` → retorna `{ alreadyConnected: true }`, escreve `status: 'connected'` no banco e **não chama** `/instance/connect`.
- Se vier `connecting` → retorna `{ stillConnecting: true }`, mantém status atual, não força nada.
- Só se vier `close`/`closed`/erro é que chama `/instance/connect` de verdade.

### 2. Não rebaixar status sem motivo
- Nunca escrever `connecting` no banco se a instância **estava `connected`** e o Evolution responder qualquer coisa diferente de `close`.
- Só gravar `qr_code` no banco quando o payload realmente tiver um QR válido (string base64 não-vazia).

### 3. Frontend trata as três respostas
No `InstanceCard.tsx`, `handleReconnect`:
- `alreadyConnected` → toast verde "Instância já está conectada."
- `stillConnecting` → toast info "Reconexão em andamento, aguarde alguns segundos."
- `qr` presente → toast info com "Sessão expirada — gere o QR Code".
- Resto → toast "Reconexão disparada".

### 4. Corrigir o estado atual da sua instância
Vou rodar um update no banco trocando `status` de `connecting` para `connected` na instância afetada (ou nas instâncias que estiverem em `connecting` por menos de 5 minutos), já que sabemos que o Evolution está com elas como `open`.

## Arquivos tocados
- `supabase/functions/reconnect-instance/index.ts` — lógica condicional acima.
- `src/components/settings/InstanceCard.tsx` — tratamento dos 3 retornos.
- Update pontual no banco para tirar o status `connecting` falso.

Sem mudança de schema, sem migration.
