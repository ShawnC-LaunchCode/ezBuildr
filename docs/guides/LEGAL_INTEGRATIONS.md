# Legal Integrations Setup

ezBuildr packages Clio Manage, Stripe Payments, and DocuSign into one project-level
delivery stack. Open a project, select **Integrations**, and follow the cards in
the order shown: connect credentials, authorize the provider, then use the
packaged workflow action.

Credentials entered in the setup dialogs are encrypted with AES-256-GCM using
`VL_MASTER_KEY`. The UI, connection-list responses, logs, and portability exports
never return plaintext provider credentials.

## Clio Manage

The Clio connection can create person or company contacts and upload PDF, DOCX,
or text documents (up to 5 MB) to a matter.

1. Create a **Clio Manage** OAuth application in the developer portal for the
   same data region as the firm. A Clio Platform/Grow application cannot call
   the Manage matters and documents API.
2. Register this callback URL in Clio:

   ```text
   https://YOUR_EZBUILDR_HOST/api/connections/oauth/callback
   ```

3. Grant write access to Contacts and Documents, plus access to Matters. The
   authorizing Clio user must also have those permissions in the firm account.
4. In ezBuildr, choose the Clio data region, enter the application client ID and
   client secret, then select **Save and authorize**.
5. Approve the request in Clio. The callback stores the access and refresh tokens
   encrypted and returns to the project integrations page.

Clio Manage is regional. A Canadian token, for example, is used only with
`ca.app.clio.com`; selecting the wrong region results in an authorization error.
See Clio's [Manage authorization guide](https://docs.developers.clio.com/api-docs/clio-manage/authorization/)
and [API reference](https://docs.developers.clio.com/clio-manage/api-reference/).

## Stripe Payments

The Stripe package creates PaymentIntents on the server and returns the
`clientSecret` required by Stripe.js. Every request requires an idempotency key;
reuse the same key when retrying the same matter payment to avoid duplicate
PaymentIntents.

1. In Stripe Workbench, create a restricted key with permission to create
   PaymentIntents, or use the account's test-mode secret key while developing.
2. Create a webhook destination for the URL displayed on the Stripe integration
   card. Subscribe to at least:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
3. Copy the endpoint's `whsec_...` signing secret.
4. Enter the `rk_test_...`/`rk_live_...` restricted key (or an `sk_...`
   secret key) and `whsec_...` secret in ezBuildr.

The webhook verifies Stripe's signature against the exact request bytes and
rejects signatures older than five minutes. PaymentIntent events must also carry
the project ID written by ezBuildr in Stripe metadata. Configure separate webhook
destinations for separate project connections.

See Stripe's [PaymentIntents guide](https://docs.stripe.com/payments/payment-intents)
and [webhook signature guide](https://docs.stripe.com/webhooks/signature).

## DocuSign

DocuSign is configured once by an ezBuildr administrator rather than per project.
The integrations page reports whether the provider is available. When configured,
signature blocks can create mapped envelopes, open embedded signing, process
Connect lifecycle events, and attach the completed PDF to the workflow run.

Follow [DocuSign E-Signature Integration](./ESIGNATURE_INTEGRATION.md) for JWT
Grant, consent, Connect HMAC, and environment-variable setup.

## Failure handling

| Message | What to do |
|---|---|
| Authorization needed | Re-open Clio setup and complete the approval in Clio. |
| Saved credentials rejected | Rotate the provider credential, then reconnect. |
| Provider is rate limiting requests | Wait and retry. The response is marked retryable. |
| Webhook signature invalid or expired | Confirm the endpoint signing secret and send the original raw body. |
| Webhook does not belong to this project | Use the webhook URL shown on the matching project's Stripe card. |
| Server setup needed | Ask an administrator to configure the DocuSign environment variables. |

Provider response bodies are not reflected to users because they can contain
sensitive diagnostics. Server logs record only the provider, operation, safe
status, connection ID, and provider request ID.
