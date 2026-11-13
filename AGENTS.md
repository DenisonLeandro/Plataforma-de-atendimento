# Architecture rules

- Keep assignment-list ordering in a pure frontend utility with focused tests; presentation order must not change instance access or assignment permissions.
- Normalize WhatsApp edit envelopes in the shared message-edits module and scope writes to the originating instance; this prevents duplicate edit messages and cross-instance updates.- Decrypt WhatsApp `secretEncryptedMessage` edits in `_shared/message-secret.ts` using the original message's stored `message_secret` and apply them to the original row; never save an encrypted edit as a new message, because that creates fake "Mensagem" bubbles.
- The watchdog measures inbound delivery lag only from webhook events without `payload.source`, because replayed events carry old timestamps and would trigger false alerts.
- Evolution webhooks must subscribe to `MESSAGES_SET`, and the watchdog filters by the record's server-store time (cuid `id`), not `messageTimestamp`, because delayed batches after a QR re-pair arrive as history with old timestamps and were silently dropped.
- History sync must resolve `@lid`-only chats (real phone in message keys, or an existing conversation holding the same WhatsApp message ids) before creating a contact, and never re-insert a message id that lives in another conversation; otherwise each sync duplicates conversations.
- Per-contact Evolution loops (e.g. fix-contact-names) run in `EdgeRuntime.waitUntil` with bounded concurrency, because instances have hundreds of contacts and a synchronous loop exceeds the function timeout.
