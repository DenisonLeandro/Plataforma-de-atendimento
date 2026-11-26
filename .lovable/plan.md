# Guia: próximo passo no servidor da Hostinger

## O que o print mostrou
- CPU 3%, memória 19%, disco 8 de 100 GB. **O servidor tem folga. Não falta espaço nem memória.**
- Comprar mais espaço ou um plano maior **não vai resolver**.
- Então o suspeito é a própria Evolution: ela reinicia sozinha ou tem falhas na versão instalada.

## O que fazer agora (5 minutos)
1. No painel da Hostinger, clique em **Console web**.
2. Copie e cole cada linha abaixo, aperte Enter e tire print do resultado:

```text
docker ps
docker logs --since 1h $(docker ps --format '{{.Names}}' | grep -i evolution | grep -v -i -E 'postgres|redis' | head -1) 2>&1 | tail -80
docker inspect $(docker ps --format '{{.Names}}' | grep -i evolution | grep -v -i -E 'postgres|redis' | head -1) --format '{{.Config.Image}}'
```

3. Me envie os prints.

## O que vou procurar nos prints
- **"Up X minutes" baixo** na primeira linha: a Evolution está reiniciando sozinha.
- **Erros repetidos** nas mensagens (por exemplo "Connection Closed", "Stream Errored", "lid"): falha conhecida da versão.
- **Versão da Evolution** na última linha: se for 2.3.7 ou mais antiga, a solução é atualizar.

## Depois
Com os prints, te passo o passo exato para corrigir: atualizar a Evolution (com backup antes) ou ajustar a configuração. Em seguida, ler o QR Code de novo no Centro e no Cinco Conjuntos.
