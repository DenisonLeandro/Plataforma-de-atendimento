## Diagnóstico

A instância **sao lourenco** está marcada como `disconnected` e os testes de conexão estão falhando silenciosamente.

Olhando os segredos cadastrados:

- `api_url` salva hoje:
  `https://evolution-api-hbbv.srv1746890.hstgr.cloud/manager/instance/b8e7788d-4d4a-4765-9ca4-01355a2150d2/dashboard`
- `instance_name`: `sao-lourenco`
- `provider_type`: `self_hosted`
- `instance_id_external`: vazio

O valor colado em "URL da API" é o link do **painel Manager** (a tela web do Evolution), não o endpoint da API. A edge function monta a chamada como:

```
{api_url}/instance/connectionState/sao-lourenco
```

Resultando em uma URL que cai no HTML do dashboard e nunca retorna `state: open`, então o status fica eternamente `disconnected`. A instância "Advocacia" funciona porque a URL dela aponta para a raiz da API.

Comparação:

| Instância          | api_url atual                                                                                          | Status        |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ------------- |
| Advocacia          | (URL raiz da API — correta)                                                                            | connected     |
| sao lourenco       | `.../manager/instance/<uuid>/dashboard` (URL do painel)                                                | disconnected  |

Além disso, a UUID `b8e7788d-4d4a-4765-9ca4-01355a2150d2` que aparece no link é o `instance_id_external` real dessa instância no Evolution — útil caso ela seja Cloud em vez de self-hosted.

## O que fazer

Não é um bug do código — é configuração. Duas opções:

### Opção A — Correção rápida pela UI (recomendada)

1. Ir em **Configurações → Instâncias → sao lourenco → Editar**.
2. No campo **URL da API**, trocar para apenas a raiz:
   `https://evolution-api-hbbv.srv1746890.hstgr.cloud`
3. Manter `Instance Name = sao-lourenco` e provider `Self-Hosted`.
4. Salvar e clicar em **Testar conexão**.

Se mesmo assim a Evolution responder 404 para `sao-lourenco`, significa que esse servidor é a versão Cloud/Manager (que indexa por UUID). Nesse caso:

- Trocar provider para **Cloud**.
- Preencher **Instance ID (UUID)** com `b8e7788d-4d4a-4765-9ca4-01355a2150d2`.
- Testar de novo.

### Opção B — Eu corrijo direto no banco

Posso aplicar uma migration/UPDATE em `whatsapp_instance_secrets` para sobrescrever a `api_url` da instância `29284c4b-...` com a URL raiz, sem precisar mexer na UI. Só preciso da sua confirmação de qual valor usar (raiz pura, ou raiz + provider Cloud + UUID).

## Pergunta antes de implementar

Qual opção prefere?

1. Você mesmo edita pela tela (Opção A).
2. Eu corrijo no banco (Opção B) — me diga se é **self-hosted com URL raiz** ou **Cloud com UUID `b8e7788d-4d4a-4765-9ca4-01355a2150d2`**.
