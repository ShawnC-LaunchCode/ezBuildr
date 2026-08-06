# DocuSign E-Signature Integration

**Status:** Production implementation available (GH-157, August 2026)

## What the integration does

- Authenticates with DocuSign through the OAuth JWT grant (`signature` and
  `impersonation` scopes).
- Builds an envelope from project-scoped templates or documents already
  generated for the current run.
- Maps the signature block's signer role, routing order, and variable-backed
  tab values into the DocuSign envelope.
- Creates an embedded recipient view and redirects the live workflow runner to
  its signing URL.
- Verifies DocuSign Connect events against the exact raw request bytes with
  HMAC-SHA256.
- Stores a completed envelope's combined signed PDF through the configured
  `storageProvider` and creates a `run_generated_documents` record for the run.
- Audits completed, declined, voided, and expired lifecycle events in
  `signature_events`.

Builder preview remains a local simulation and never calls DocuSign.

## Configuration

Create a DocuSign integration key configured for JWT grant, grant the
impersonation consent required by DocuSign, and set:

```env
DOCUSIGN_INTEGRATION_KEY=<integration/client key>
DOCUSIGN_USER_ID=<impersonated API user GUID>
DOCUSIGN_ACCOUNT_ID=<DocuSign account GUID>
DOCUSIGN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_OAUTH_BASE_PATH=https://account-d.docusign.com
DOCUSIGN_WEBHOOK_SECRET=<DocuSign Connect HMAC key>
```

For production, use the production REST base path assigned to the account and
`https://account.docusign.com` for OAuth. Escaped newlines in the private-key
environment value are normalized automatically. The private key and webhook
secret must never be committed or logged.

When all required authentication values are present, server startup registers
the provider. With incomplete configuration, startup continues but DocuSign is
not listed as an available provider. A missing webhook secret always causes
webhook verification to fail closed.

## DocuSign Connect

Create a Connect configuration that sends JSON events to:

```text
https://<ezbuildr-host>/api/esign/webhook/docusign
```

Enable at least these envelope events:

- Envelope Completed
- Envelope Declined
- Envelope Voided

Configure HMAC signing and copy the same key into
`DOCUSIGN_WEBHOOK_SECRET`. The legacy
`/api/esign/callback/docusign` URL remains as a compatibility alias.

## Runtime contract

The runner calls:

```http
POST /api/esign/execute/:runId/:stepId
Authorization: Bearer <run token>
Content-Type: application/json

{}
```

The server deliberately ignores client-supplied signature configuration and
values. It loads the signature step from the run's workflow, rebuilds canonical
alias-keyed values from `step_values`, and resolves documents only inside that
run or the workflow's project. Creator sessions can use the same endpoint.

Status queries require the creator session or matching run token:

```http
GET /api/esign/status/:envelopeId?runId=<run UUID>
```

## Document and audit storage

On `envelope-completed`, ezBuildr downloads DocuSign's `combined` PDF and stores
it at a key shaped like:

```text
runs/<runId>/signatures/<signatureRequestId>/signed-<envelopeId>.pdf
```

The key is recorded on the signature request and a generated-document row is
attached to the run, so the existing authenticated run-document download and
delivery paths can use the signed artifact. Webhook retries are idempotent once
the signature request has a stored document key.

## Testing

Provider tests use mocked HTTP responses and a generated RSA key; no DocuSign
credentials or network traffic are required. The integration test proves the
run-token execution route, HMAC rejection, completed PDF storage, and
completed/declined/voided audit persistence against PostgreSQL.

```powershell
npx vitest run --project unit-fast tests/unit/services/DocusignProvider.test.ts
npx vitest run --project integration tests/integration/esign.docusign.test.ts
```
