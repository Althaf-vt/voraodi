# Payment Consistency Report — Razorpay Flow (Post Phase 1)

**Date:** 2026-05-30  
**Scope:** Razorpay checkout after Phase 1 (transactions, ownership, pricing)  
**Method:** Read-only code review (`checkoutController.js`, `orderFulfillment.js`, `checkout.ejs`, `orderSchema.js`, routes)  
**Code modified for this report:** None

---

## Executive summary

| Question | Short answer |
|----------|----------------|
| 1. Charged while DB transaction fails? | **Yes** — Razorpay captures funds **before** MongoDB transactions run. |
| 2. MongoDB abort after Razorpay confirms? | Order/stock **unchanged** (rolled back on retry path); user **still charged**. |
| 3. Server crash between verify and place-order? | **Orphaned payment** possible on normal checkout; cart may remain full. |
| 4. Recovery for orphaned payments? | **Partial** — manual retry flow for failed orders only; **no** automated reconciliation. |
| 5. Webhook / reconciliation? | **None implemented** — strongly recommended before high-volume production. |

**Overall payment consistency rating:** **Weak** for normal (first-time) Razorpay checkout; **Moderate** for retry-after-failure path (single DB order exists, but still no payment-id persistence in schema).

---

## Architecture overview

The application implements **two different Razorpay checkout patterns**.

### Flow A — Normal checkout (cart → new order)

No application `Order` exists until after Razorpay succeeds.

```
┌──────────┐    ┌─────────────────────┐    ┌─────────────┐    ┌────────────────────────┐    ┌─────────────┐
│ Browser  │───▶│ POST /create-       │───▶│ Razorpay    │───▶│ Customer pays          │───▶│ POST /verify-│
│ checkout │    │ razorpay-order      │    │ Checkout UI │    │ (capture at Razorpay)  │    │ razorpay-     │
└──────────┘    └─────────────────────┘    └─────────────┘    └────────────────────────┘    │ payment       │
                                                                                              └──────┬──────┘
                                                                                                     │
                     Signature check ONLY (no Order write)                                           │
                                                                                                     ▼
                                                                                              ┌─────────────┐
                                                                                              │ POST /place-│
                                                                                              │ order       │
                                                                                              │ (withTrans- │
                                                                                              │ action)     │
                                                                                              └─────────────┘
```

**References:** `views/user/checkout.ejs` (handler ~660–708), `verifyRazorpayPayment` else branch (~505–507), `placeOrder` → `fulfillNewOrderFromCart`.

### Flow B — Retry checkout (failed order → same order)

Application `Order` already exists (`Payment Failed` / `paymentStatus: Failed`).

```
payment.failed ──▶ POST /payment-failed ──▶ Order (Payment Failed), cart cleared
       │
       └──▶ User returns to /checkout?orderId=...

POST /retry-razorpay-order ──▶ Razorpay order created, optional order.razorpayOrderId saved*
       │
       └──▶ Pay ──▶ POST /verify-razorpay-payment { orderId } ──▶ withTransaction( fulfillRazorpayRetryOrder )

* razorpayOrderId / razorpayPaymentId are NOT defined on orderSchema (strict mode strips them — see §4)
```

**References:** `paymentFailed`, `retryRazorpayOrder`, `verifyRazorpayPayment` + `fulfillRazorpayRetryOrder`.

### Flow C — Wallet / COD (comparison)

Razorpay is **not** involved. `placeOrder` runs a **single** MongoDB transaction for order + stock (+ wallet debit). Payment and persistence are aligned — **no external capture before DB**.

---

## 1. Can a user be charged while the order transaction fails?

### Answer: **Yes**

Razorpay Checkout captures payment when the customer completes payment in the Razorpay modal. That happens **inside the browser**, before your server finishes `verify-razorpay-payment` and **before** any `withTransaction()` block runs.

| Step | Committed at Razorpay? | Inside MongoDB transaction? |
|------|------------------------|-----------------------------|
| `createRazorpayOrder` / `retryRazorpayOrder` | Creates Razorpay **order** object only | No |
| User pays in modal | **Yes — funds captured** | No |
| `verifyRazorpayPayment` (signature HMAC) | N/A | **No** (normal flow: no order write) |
| `withTransaction` (retry: `fulfillRazorpayRetryOrder`) | N/A | Yes |
| `withTransaction` (normal: `fulfillNewOrderFromCart`) | N/A | Yes |

**Phase 1 improvement:** Stock, coupon, wallet (N/A for Razorpay), and order document updates on the **retry path** are atomic **with each other** once the transaction starts. They are **not** atomic with the Razorpay charge.

**Normal-flow additional gap:** `verify` and `place-order` are **two separate HTTP requests**. Only `place-order` uses a transaction. The charge is already committed before `place-order` begins.

---

## 2. What happens if MongoDB aborts after Razorpay confirms payment?

### Flow B (retry — `orderId` present)

**Code path:** `verifyRazorpayPayment` → `withTransaction` → `fulfillRazorpayRetryOrder` (`services/orderFulfillment.js`).

On transaction **abort** (stock insufficient, coupon error, replica set error, etc.):

| Artifact | State after abort |
|----------|-------------------|
| Razorpay payment | **Captured** — not rolled back by MongoDB |
| App `Order.paymentStatus` | Remains **`Failed`** (unchanged) |
| App `Order.status` | Remains **`Payment Failed`** (unchanged) |
| Stock | **Not** decremented (rolled back) |
| Coupon `usedBy` | Rolled back if failure after coupon save in same transaction |
| `razorpayPaymentId` on order | **Not saved** (save never committed) |

**API response:** `500` or `4xx` with error message; frontend shows toast (`checkout.ejs` ~710–711). User is **not** redirected to order success.

**User experience:** Paid money, order still shows as payment failed, may retry and risk **double charge** if they pay again (Razorpay creates a new payment each checkout attempt).

### Flow A (normal — no `orderId`)

Transaction abort on `place-order` / `fulfillNewOrderFromCart`:

| Artifact | State after abort |
|----------|-------------------|
| Razorpay payment | **Captured** |
| App order | **None created** |
| Cart | **Unchanged** (cart clear is inside transaction — rolled back) |
| Stock | Unchanged |

**API response:** Error JSON; user sees toast, cart still full.

### Coupon edge case (both flows)

If `validateAndApplyCoupon` runs inside the transaction and the transaction aborts **after** `coupon.save({ session })`, coupon usage rolls back with the transaction. If abort happens inconsistently across drivers, monitor coupon `usedBy` in QA.

---

## 3. What happens if the server crashes between payment verification and order creation?

Applies primarily to **Flow A** (normal checkout), where fulfillment is split:

1. `POST /verify-razorpay-payment` — signature OK → `{ success: true }`
2. `POST /place-order` — transactional fulfillment

### Crash scenarios

| Crash point | Razorpay | verify response | place-order | Likely outcome |
|-------------|----------|-----------------|-------------|----------------|
| After Razorpay capture, before verify reaches server | Captured | Never sent | Never run | **Orphan payment** — no server record |
| During verify (before response) | Captured | Unknown to client | Not run | Client may retry verify; **no idempotency** |
| After verify **200**, before place-order request | Captured | Client has success | Not run | **Orphan payment** — user may see error on refresh |
| During place-order transaction | Captured | Success | Aborted / incomplete | **Orphan payment** — cart intact (rollback) |
| After place-order commit, before HTTP response | Captured | Success | Committed | Order exists; client may not know → duplicate risk if user retries |

### Frontend behavior (`checkout.ejs`)

- Handler is `async` but **does not** disable double submission or use idempotency keys.
- On `place-order` failure, only a toast is shown — **no** link to support, **no** stored `razorpay_payment_id`.
- Network failure after verify: user may click pay again → **second Razorpay charge** possible.

### Retry flow (Flow B)

If crash after Razorpay capture but during `verify` transaction: same as §2 — paid, order still failed. User may open checkout with `?orderId=` and pay again.

---

## 4. What recovery mechanism exists for orphaned payments?

### Currently implemented

| Mechanism | What it does | Limitations |
|-----------|--------------|-------------|
| `payment.failed` event (`checkout.ejs` ~725) | Calls `POST /payment-failed`, creates `Payment Failed` order, clears cart | Only when Razorpay reports failure in modal — **not** for server/orphan failures after capture |
| Retry via `?orderId=` | `retryRazorpayOrder` + verify with `orderId` | Requires existing failed order; **does not** attach arbitrary `payment_id` to orphan capture |
| `verify` guard `paymentStatus === 'Completed'` | Blocks double completion on **same** order | No effect if payment never linked to order |
| Phase 1 ownership checks | User must own order to retry | Security OK; not reconciliation |
| Manual ops | Razorpay Dashboard refund + support | Only practical path for Flow A orphans |

### Not implemented

- No `razorpay_payment_id` / `razorpay_order_id` fields on **`orderSchema`** (strict schema — assignments in `fulfillRazorpayRetryOrder` and `retryRazorpayOrder` are **dropped** on `save()` unless `strict: false`).
- No server-side store of “verified but not fulfilled” payments.
- No admin “attach payment to order” tool.
- No automated refund job.
- No webhook handlers.
- No idempotency on `verify-razorpay-payment` for normal flow.
- No linkage between `createRazorpayOrder` receipt/notes and final `Order.orderId` on first checkout.

### Orphan classification

| Type | Detection in app today | Recovery |
|------|------------------------|----------|
| Paid, no order (Flow A) | **Not detectable** | Manual Razorpay refund + manual order |
| Paid, order still Failed (Flow B, txn abort) | User sees failed order | User may pay again (**double charge risk**) or support manual fix |
| Paid, order Completed, user thinks failed | Rare (response loss) | User refreshes order list; may duplicate if retries place-order |
| verify OK, place-order never called | **Not detectable** | None automated |

---

## 5. What webhook or reconciliation strategy should be implemented?

**Current state:** `grep` finds **no** Razorpay webhook routes in the codebase. All payment truth is inferred from the client-driven checkout handler + HMAC verify on demand.

### Recommended strategy (layered)

#### Layer 1 — Razorpay webhooks (source of truth for money)

| Event | Purpose |
|-------|---------|
| `payment.captured` | Fulfill or confirm order when capture succeeds, even if browser disconnected |
| `payment.failed` | Mark order failed / notify user |
| `order.paid` | Optional cross-check for Razorpay order lifecycle |
| `refund.processed` | Sync refund state with wallet/cancel flows |

**Implementation outline:**

1. `POST /webhooks/razorpay` — raw body, **signature verify** with webhook secret (not checkout secret only).
2. Persist events in `payment_events` collection: `{ eventId, paymentId, orderId, amount, status, payload, processedAt }` with **unique index on `eventId` or `paymentId`** for idempotency.
3. Process asynchronously (queue or inline after ack) — same `fulfillNewOrderFromCart` / `fulfillRazorpayRetryOrder` logic, keyed by notes (`userId`, `orderId`, `addressId`).

#### Layer 2 — Idempotent fulfillment API

Refactor so **one** server endpoint owns fulfillment:

```
capture confirmed (webhook OR verify handler)
  → idempotencyKey = razorpay_payment_id
  → if already fulfilled for this payment_id: return existing orderId
  → else withTransaction( fulfill )
```

- Store `razorpayPaymentId` (unique), `razorpayOrderId`, `amountPaid`, `currency` on **Order schema** (schema change required).
- Normal flow: pass `razorpay_payment_id` into `place-order` or merge verify + place into single transactional endpoint.

#### Layer 3 — Scheduled reconciliation job

Daily (or hourly) job:

1. List Razorpay `payments` captured in last N days (API).
2. Join to `orders` where `razorpayPaymentId` matches OR notes contain `orderId`.
3. Flag: **captured with no Completed order**, **amount mismatch**, **duplicate payment_ids**.
4. Output CSV / admin alert / Slack.

#### Layer 4 — Amount and order consistency checks

At fulfillment time:

| Check | Why |
|-------|-----|
| `payment.amount === order.finalAmount * 100` | Prevent under/over charge vs cart drift |
| Razorpay `order_id` matches stored `razorpayOrderId` on retry | Prevent wrong payment attached |
| Cart hash or line-item snapshot at `createRazorpayOrder` | Detect price changes between create and fulfill |

Today `createRazorpayOrder` and `place-order` can compute totals **independently** — race if prices/stock/coupon change between calls.

#### Layer 5 — Client UX hardening

- Disable pay button after success; show “Finalizing order…”
- Pass `razorpay_payment_id` to `place-order` and persist.
- On place-order failure after verify: show “Payment received — reference {payment_id}” and support contact, **do not** open Razorpay again automatically.

### Suggested priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Add `razorpayPaymentId`, `razorpayOrderId` to schema + persist on fulfill | Low | Enables any reconciliation |
| P0 | `payment.captured` webhook + idempotent fulfill | Medium | Fixes orphans & crashes |
| P1 | Merge verify + place-order for normal flow (single transaction after capture proof) | Medium | Shrinks failure window |
| P1 | Daily reconciliation report | Low–medium | Catches historical orphans |
| P2 | Amount validation against Razorpay API | Medium | Prevents mismatch fraud/bugs |

---

## Phase 1 interaction matrix

| Phase 1 change | Effect on payment consistency |
|----------------|------------------------------|
| `withTransaction` on retry verify | Retry path: order + stock + coupon atomic; **does not** include Razorpay |
| `withTransaction` on normal place-order | Cart + order + stock atomic; **after** Razorpay charge |
| Session `userId` on place-order | Prevents placing order on another user’s session — good |
| Ownership on verify retry | Prevents fulfilling another user’s failed order — good |
| `paymentStatus === 'Completed'` guard | Prevents re-fulfill on same order — good |
| No webhook | **No improvement** to orphan detection |
| Pricing helpers on retry | Correct totals on retry; unrelated to capture timing |

---

## Risk register (Razorpay-specific)

| ID | Risk | Severity | Likelihood |
|----|------|----------|------------|
| R1 | Normal checkout: charge before order exists | **Critical** | Medium |
| R2 | Transaction abort after capture (retry) | **High** | Low–medium |
| R3 | Double `place-order` after single payment | **High** | Low |
| R4 | Double Razorpay charge on retry after failed fulfill | **High** | Medium |
| R5 | Payment IDs not persisted (schema) | **High** | Certain on retry save |
| R6 | Amount drift create-Razorpay vs place-order | Medium | Low |
| R7 | No webhook — browser-only fulfillment | **High** | Ongoing |

---

## Testing recommendations (pre-production)

1. **Simulate txn abort:** Mock `deductOrderItemsStock` failure after test payment on retry — confirm order stays Failed and document payment_id for manual refund.
2. **Simulate place-order failure:** After verify 200, return 500 from `place-order` — confirm cart intact and payment orphaned.
3. **Double-click:** Two rapid `place-order` calls after one verify — check for duplicate orders.
4. **Disconnect:** Kill network after Razorpay success before verify completes.
5. **Inspect DB:** After retry payment, confirm whether `razorpayPaymentId` actually exists on order document (expect **missing** until schema updated).

---

## Conclusion

Phase 1 **strengthens internal consistency** (stock, coupons, order fields) **after** the server begins a MongoDB transaction, but it **does not** solve the fundamental split between:

- **Razorpay** (external payment commitment), and  
- **Application** (order creation in one or two HTTP steps).

Until webhooks, payment-id persistence, and idempotent fulfillment exist, **yes — users can be charged while order transactions fail**, and **orphaned payments require manual reconciliation** via the Razorpay Dashboard.

**Do not treat Razorpay production traffic as financially consistent** until at least P0 items in §5 are implemented (recommended Phase 2 scope).

---

## Document references

| File | Relevance |
|------|-----------|
| `views/user/checkout.ejs` | Client payment sequence |
| `controllers/user/checkoutController.js` | `createRazorpayOrder`, `verifyRazorpayPayment`, `placeOrder`, `paymentFailed`, `retryRazorpayOrder` |
| `services/orderFulfillment.js` | `fulfillNewOrderFromCart`, `fulfillRazorpayRetryOrder` |
| `utils/withTransaction.js` | Transaction boundaries |
| `models/orderSchema.js` | No Razorpay ID fields |
| `routes/userRouter.js` | Route map |
| `DEPLOYMENT_READINESS_REPORT.md` | §5.2 payment vs transaction boundary |
