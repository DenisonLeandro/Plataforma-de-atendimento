## Diagnóstico

O erro "Erro ao criar instância" ocorre porque a RLS de `whatsapp_instances` bloqueia o INSERT. Os logs do Postgres confirmam:

```
ERROR: new row violates row-level security policy for table "whatsapp_instances"
```

A policy exige uma destas condições:
- `has_role(auth.uid(),'admin') AND company_id = get_user_company_id(auth.uid())` — ou seja, admin local **daquela** empresa; ou
- `super_admin_can_write_company(auth.uid(), company_id)` — super admin com acesso explícito à empresa.

Quem está tentando criar é o Denison (super admin), com a plataforma no modo "Entrar como Desenvol Informática". Na tabela `super_admin_company_access` ele só tem liberação para **Piscinas Ibipora** — não há linha para **Desenvol Informática**, então a RLS recusa o INSERT.

O admin local da Desenvol (leandro@desenvol.com.br) até existe e teria permissão, mas quem está criando agora é o super admin no modo "view as".

## Correção

Inserir em `super_admin_company_access` a autorização do Denison (`1ce45272-1241-4829-9435-6d841b959353`) para a empresa Desenvol Informática (`d68c2a97-9ebb-44f8-afe0-357857ec9007`), via migration. Isso libera criação/edição de instâncias, envio de mensagens e demais escritas de super admin nessa empresa — mesmo padrão já aprovado para Piscinas Ibipora.

Nenhuma alteração de código é necessária: a policy e o fluxo já suportam esse cenário; falta apenas a linha de autorização.

## Verificação

- Rodar `SELECT super_admin_can_write_company('1ce45272...','d68c2a97...')` e confirmar `true`.
- Recriar a instância "Desenvol Suporte" pela UI — deve salvar sem erro.
