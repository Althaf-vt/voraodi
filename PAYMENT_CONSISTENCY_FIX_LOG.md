# Payment Consistency Fix Log

**Date:** 2026-05-30  
**Scope:** Razorpay capture ↔ MongoDB order alignment only (no Phase 2 security/rate-limit work).

## Problem

Money could be captured in Razorpay while no completed order existed in MongoDB because:

1. Checkout verified the payment signature, then relied on a **second** `place-order` request.
2. A crash or DB transaction failure between those steps left an orphan capture.
3. `razorpayPaymentId` / `razorpayOrderId` were not persisted on the Order schema.
4. There was no `payment.captured` webhook safety net.
5. Duplicate fulfillment was possible (double `place-order`, retry + verify race).

## Solution Overview

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | Persist Razorpay IDs on Order | `models/orderSchema.js` — `razorpayPaymentId` (unique sparse), `razorpayOrderId`, `paymentCapturedAt` |
| 2 | `payment.captured` webhook | `POST /webhooks/razorpay` → `controllers/razorpayWebhookController.js` |
| 3 | Webhook signature verification | `utils/razorpayWebhook.js` — HMAC SHA256 on raw body; env `RAZORPAY_WEBHOOK_SECRET` |
| 4 | Idempotent fulfillment | `services/razorpayFulfillment.js` — `fulfillCapturedPayment()` keyed by `razorpayPaymentId` |
| 5 | Prevent duplicate fulfillment | Unique index on `razorpayPaymentId`; early return if order already `Completed`; `PaymentEvent.eventId` unique |
| 6 | Reconciliation script | `scripts/reconcile-razorpay-payments.js` |
| 7 | This log | `PAYMENT_CONSISTENCY_FIX_LOG.md` |

## Files Added

| File | Purpose |
|------|---------|
| `models/paymentIntentSchema.js` | Checkout context (`userId`, `addressId`, `couponCode`, flow) for webhook recovery |
| `models/paymentEventSchema.js` | Webhook idempotency (`eventId` unique) |
| `utils/razorpayClient.js` | Shared Razorpay SDK instance |
| `utils/razorpayWebhook.js` | Checkout + webhook signature helpers |
| `services/razorpayFulfillment.js` | Single idempotent entry: `fulfillCapturedPayment()` |
| `controllers/razorpayWebhookController.js` | Handles `payment.captured` |
| `routes/webhookRouter.js` | Webhook routes |
| `scripts/reconcile-razorpay-payments.js` | Razorpay vs DB mismatch report |

## Files Modified

| File | Change |
|------|--------|
| `models/orderSchema.js` | Razorpay ID fields + indexes |
| `services/orderFulfillment.js` | Persist IDs on new/retry orders; duplicate payment guard |
| `controllers/user/checkoutController.js` | `createRazorpayOrder` / `retryRazorpayOrder` upsert `PaymentIntent`; `verifyRazorpayPayment` fulfills in one transaction; `place-order` accepts Razorpay IDs as idempotent fallback |
| `views/user/checkout.ejs` | After verify, redirect using `orderId` from response (no second `place-order` for Razorpay) |
| `server.js` | Mount `/webhooks` with `express.raw()` **before** `express.json()` |

## Payment Flow (After Fix)

### Normal cart checkout

```
create-razorpay-order → PaymentIntent upserted
  → Razorpay modal capture
  → verify-razorpay-payment (signature + fulfillCapturedPayment in txn)
  → redirect /order-success/:orderId
```

### Retry payment

```
retry-razorpay-order → PaymentIntent (flow: retry) + Order.razorpayOrderId
  → modal capture
  → verify-razorpay-payment → fulfillRazorpayRetryOrder (idempotent)
```

### Webhook safety net

```
Razorpay payment.captured
  → POST /webhooks/razorpay (raw body + signature)
  → PaymentEvent dedupe by event.id
  → fulfillCapturedPayment from payment notes / PaymentIntent
```

## Idempotency Rules

1. **`razorpayPaymentId`** — If an order with this ID is already `Completed`, return that `orderId`.
2. **`razorpayOrderId`** — If a completed order exists for the Razorpay order, attach payment ID if missing and return.
3. **`PaymentIntent`** — After fulfillment, `status: fulfilled` + `fulfilledOrderId`.
4. **`PaymentEvent`** — Unique `eventId`; duplicate webhooks return `200 duplicate_event`.
5. **Stock / cart** — Only deducted inside `fulfillNewOrderFromCart` / `fulfillRazorpayRetryOrder`, not on verify-only paths.

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `RAZORPAY_KEY_ID` | Yes | Existing |
| `RAZORPAY_KEY_SECRET` | Yes | Checkout signature |
| `RAZORPAY_WEBHOOK_SECRET` | Yes (prod) | From Razorpay Dashboard → Webhooks |
| `MONGODB_URI` | Yes | Replica set required for transactions |

## Razorpay Dashboard Setup

1. Create webhook URL: `https://<your-domain>/webhooks/razorpay`
2. Enable event: **payment.captured**
3. Copy webhook secret → `RAZORPAY_WEBHOOK_SECRET`
4. Use test mode first; run reconciliation script after test payments

## Reconciliation Script

```bash
node scripts/reconcile-razorpay-payments.js --days=30
node scripts/reconcile-razorpay-payments.js --days=7 --json
```

**Exit code 1** if captured payments lack a completed order or order is incomplete.

Reports:

- Captured in Razorpay, no matching completed order
- Captured but `paymentStatus !== Completed`
- Pending `PaymentIntent` while Razorpay order is captured

## Manual Test Checklist

- [ ] Normal Razorpay checkout creates one order with `razorpayPaymentId`, `paymentStatus: Completed`
- [ ] Refresh / double-submit verify does not create duplicate orders
- [ ] Retry payment completes same `orderId` with new `razorpayPaymentId`
- [ ] Webhook with valid signature fulfills when verify never ran (simulate with Razorpay test webhook)
- [ ] Invalid webhook signature returns `400`
- [ ] Duplicate webhook `event.id` returns `200 duplicate_event` without double stock deduction
- [ ] `node scripts/reconcile-razorpay-payments.js` reports OK after test payments
- [ ] COD / wallet checkout unchanged (still uses `place-order` only)

## Deployment Notes

- **MongoDB replica set** required for `withTransaction` (existing Phase 1 requirement).
- Register webhook URL only after deploy; local testing use ngrok or Razorpay CLI.
- Historical orphan captures before this deploy will appear in reconciliation; fulfill manually or replay webhook from Razorpay dashboard.

## Out of Scope (Phase 2+)

- CSRF tokens, rate limiting, admin hardening
- Refund webhook handling
- Automatic backfill job for pre-migration orders without `razorpayPaymentId`
