# Architecture rules

- Keep assignment-list ordering in a pure frontend utility with focused tests; presentation order must not change instance access or assignment permissions.
- Normalize WhatsApp edit envelopes in the shared message-edits module and scope writes to the originating instance; this prevents duplicate edit messages and cross-instance updates.- Decrypt WhatsApp `secretEncryptedMessage` edits in `_shared/message-secret.ts` using the original message's stored `message_secret` and apply them to the original row; never save an encrypted edit as a new message, because that creates fake "Mensagem" bubbles.
- The watchdog measures inbound delivery lag only from webhook events without `payload.source`, because replayed events carry old timestamps and would trigger false alerts.
