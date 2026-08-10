# Arquitetura WhatsApp do Kavro

## Decisão

O navegador nunca acessa a Evolution API. Toda operação passa por `apps/api`, que deriva a organização da sessão autenticada e resolve internamente uma conexão opaca.

```text
Next.js → API Kavro → Evolution API v2.3.7 → WhatsApp
                    ↘ webhook → inbox idempotente → banco → realtime
```

## Segredos

- `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` existem somente no backend/secret manager.
- QR Code é efêmero e nunca é persistido ou registrado em logs.
- O webhook usa segredo aleatório por conexão e identificador opaco.
- Nenhum `instance_name`, chave ou URL privilegiada é aceito livremente do navegador.

## Fluxos

1. Owner/admin solicita uma conexão ao backend.
2. Backend cria nome opaco, provisiona a instância e configura webhook por instância.
3. Front recebe somente QR efêmero e status filtrado.
4. Webhook valida segredo, resolve a organização pela conexão, registra hash único e responde rapidamente.
5. Worker converte o evento em conversa/mensagem e atualiza o CRM.
6. Envio cria primeiro uma mensagem local pendente com chave idempotente; worker envia e reconcilia status.

## Controles obrigatórios

- Evolution fixada em `v2.3.7`, nunca `latest`.
- `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false`.
- CORS restrito, HTTPS, firewall e Evolution preferencialmente em rede privada.
- Webhook `base64=false`; mídia em bucket privado e URLs assinadas curtas.
- Limite inicial de mídia: 50 MB, com validação MIME e antivírus antes do envio.
- Rate limit por organização, usuário e destinatário.
- Logs com redação; sem corpo de mensagem, telefone completo, token ou QR.
- Deduplicação por conexão + ID externo e hash do payload.
- WebSocket global da Evolution não é exposto ao frontend.

## Eventos iniciais

- `MESSAGES_UPSERT`
- `MESSAGES_UPDATE`
- `MESSAGES_DELETE`
- `SEND_MESSAGE`
- `CONNECTION_UPDATE`
- `QRCODE_UPDATED` apenas durante pareamento

`MESSAGES_SET` fica desativado até existir uma estratégia explícita de importação de histórico.
