# Architecture rules

- Keep assignment-list ordering in a pure frontend utility with focused tests; presentation order must not change instance access or assignment permissions.
- Normalize WhatsApp edit envelopes in the shared message-edits module and scope writes to the originating instance; this prevents duplicate edit messages and cross-instance updates.