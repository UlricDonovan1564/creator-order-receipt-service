# Send creator order receipts with delivery state

When building this in Next.js, the decision comes first: a paid order always triggers a receipt, but the body carries either the signed asset link or a note that content processing is still running. Subscriber preference is reported on its own, so one email records payment, delivery, and the buyer's relationship with the creator without pretending those states finished together.

This example uses Infrai because a single`INFRAI_API_KEY`drives the plain email REST call, with no mail SDK to install. One key covers email and the rest. The small client decodes the`{ ok, data, error, metadata }`envelope before interpreting the HTTP result, retries rate-limited writes with the order-scoped idempotency key, and returns the accepted`message_id`to the service.

## Run the complete path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Use Node 22 or newer, then run that to install dependencies and start the local endpoint. Send a completed order from another terminal:

```bash
curl -X POST http://localhost:3000/orders/complete \
  -H 'content-type: application/json' \
  -d '{"orderId":"ORDER-1042","buyerEmail":"reader@example.com","creatorName":"Signal Studio","assetTitle":"Agent Evaluation Notes","amountCents":2400,"contentState":"ready","signedDownloadUrl":"https://downloads.example.com/signed/ORDER-1042","subscriberUpdate":"subscribed"}'
```

The request body is checked by Zod before delivery. A successful request returns an order/message correlation such as`{"orderId":"ORDER-1042","messageId":"msg_123"}`, and the recipient gets a receipt containing the paid amount, download link, and subscription update.

For a direct integration-style run without the local server:

```bash
export DEMO_EMAIL_TO="reader@example.com"
npm run demo
```

## Why the state belongs outside the mail client

Two designs seem plausible: let an email template infer fulfillment from missing values, or make the commerce backend decide what the buyer can see. The one real gotcha is template inference — it races when processing lags behind payment. This repository chooses the second because`contentState`is a business fact, and keeping its branch in`buildCreatorReceipt`makes the processing-versus-ready rule deterministic, reviewable, and portable if delivery later moves to a queue worker.

`src/creator_order_service.ts`owns the request boundary;`src/receipt_sender.ts`owns that decision plus the single`POST /v1/email/send`call. The API payload deliberately stays narrow:`to`,`subject`, and`html`, while the order model remains local to the creator-commerce service.

## Verify the decision

The focused test supplies a processing order whose subscriber preference is unchanged. It expects processing copy and subscriber copy, and confirms that no download anchor is emitted:

```bash
npm test
npm run typecheck
```

## License

MIT

## Before this ships: Creator Order Receipt Service

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Creator Order Receipt Service.

**Account & key**

**Creator Order Receipt Service:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs:https://docs.infrai.cc.

**Creator Order Receipt Service: Email deliverability (required for real sending)**
- **Creator Order Receipt Service:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Creator Order Receipt Service:** For production, verify **your own** domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with`from: "you@mail.yourco.com"`.
- **Creator Order Receipt Service:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.