# Ajuste de versionamento do .env

## Objetivo
Parar de versionar o arquivo `.env` real, mantendo-o localmente, e criar um arquivo `.env.example` como referência para outros desenvolvedores.

## Passos

1. **Atualizar `.gitignore`**
   Adicionar ao final do arquivo `.gitignore`:
   - `.env`
   - `.env.local`
   - `.env.*.local`

2. **Remover `.env` do controle de versão**
   Executar `git rm --cached .env` para remover o arquivo do índice do Git sem deletá-lo do disco.

3. **Criar `.env.example`**
   Criar na raiz do projeto um arquivo `.env.example` com as mesmas chaves do `.env` atual, mas com valores em branco:
   - `VITE_SUPABASE_PROJECT_ID=""`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=""`
   - `VITE_SUPABASE_URL=""`

4. **Fazer commit**
   Executar o commit com a mensagem: `chore: untrack .env and add .env.example`

## Observações
- Nenhum outro arquivo será modificado.
- Não serão executados builds, atualizações de dependências ou formatação de código.