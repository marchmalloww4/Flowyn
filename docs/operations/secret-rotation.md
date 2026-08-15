# Secret and key rotation

Rotate Better Auth, webhook, integration, and AI-idempotency key material independently. Add a new version to the purpose-specific keyring, deploy with the new current version, verify existing-row decryption, then retire the old version only after its retention window.

```powershell
npm run db:preflight
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Never reuse the webhook keyring for integration or AI replay ciphertext. Never print keyrings, credentials, ciphertext plaintext, prompts, responses, queue payloads, or DSNs. A database restore without matching keyrings is not successful.
