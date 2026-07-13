## Diagnóstico

Os timestamps no banco estão **corretos** (ex.: "Bom dia" das 09:24 → `2026-07-13 12:24 UTC` = 09:24 em São Paulo, hoje).

O bug está apenas na **exibição do separador de data** em `src/components/chat/MessagesContainer.tsx`:

```ts
const dateKey = format(date, 'yyyy-MM-dd');   // ok: '2026-07-13' no fuso local
...
date: new Date(dateKey)                        // BUG: interpreta como UTC meia-noite
```

`new Date('2026-07-13')` é parseado como **UTC 00:00**. No navegador em UTC-3, isso vira `2026-07-12 21:00` local — então `isToday` retorna `false` e `isYesterday` retorna `true`, mesmo a mensagem sendo de hoje. Qualquer usuário com fuso negativo em relação ao UTC vê "Ontem" para mensagens de hoje enviadas antes das ~21h locais.

Confirma o padrão citado na knowledge base: nunca usar `new Date(stringISOsemHora)` diretamente.

## Plano de correção

1. **Corrigir `MessagesContainer.tsx`** — no agrupamento por data, guardar a data como objeto `Date` no fuso local (construído a partir de ano/mês/dia com `new Date(y, m-1, d)`) em vez de `new Date(dateKey)`. Assim `isToday`, `isYesterday`, `isSameWeek` e `format` operam todos no mesmo fuso do usuário.

2. **Varredura de segurança** — procurar outros usos de `new Date(...)` sobre strings `YYYY-MM-DD` no projeto (ex.: relatórios, filtros de data) e trocar pelo mesmo padrão local-safe onde a intenção for "dia local". Ajustar somente os que exibem/comparam dia; timestamps completos (`YYYY-MM-DDTHH:mm:ssZ`) continuam com `new Date(...)`.

3. **Guardrail para não reintroduzir** — adicionar um helper único `parseLocalDay(dateKey)` em `src/utils/` e usá-lo nos pontos afetados, deixando claro por comentário por que `new Date('YYYY-MM-DD')` é proibido.

4. **Validação visual** — abrir uma conversa com mensagem de hoje cedo (ex.: "Bom dia" 09:24) e confirmar que o separador mostra **"Hoje"**; verificar também mensagens de ontem e de dias anteriores continuam corretas.

## Arquivos afetados

- `src/components/chat/MessagesContainer.tsx` (correção principal)
- `src/utils/dateHelpers.ts` (novo helper `parseLocalDay`)
- Possíveis ajustes pontuais em componentes de relatório se a varredura encontrar o mesmo padrão

## Resultado esperado

Separadores "Hoje / Ontem / dia da semana / dd/MM/yyyy" sempre refletem o fuso local do usuário — em todas as empresas e instâncias — e o erro não volta porque o parsing de "dia" passa por um helper único e testável.
