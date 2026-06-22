# Batch 2B Investigation Report

> Investigation only — no code was modified.  
> Date: 2025-06

---

## BUG-004 — Circular imports from `server.js` in `userController.js` and `profileController.js`

---

### Exact reproduction path

1. Node.js starts and begins loading `server.js`.
2. `server.js` reaches `require('./routes/userRouter')` (line 13).
3. `userRouter.js` immediately requires both `userController` and `profileController`.
4. `userController.js` reaches line 10: `const { search } = require('../../server')`.
5. Node.js recognises that `server.js` is already in the process of loading (mid-execution) — it returns the **partially-initialised** exports object, which at that point is `{}` (the assignment `module.exports = app` has not yet executed).
6. `{ search }` destructures from `{}` → `search = undefined`.
7. `profileController.js` reaches line 15: `const { response, link } = require('../../server')`.
8. Same partially-initialised module is returned → `response = undefined`, `link = undefined`.
9. `server.js` finishes loading, eventually executes `module.exports = app`.
10. The cached module export is now `app`, but the variables already bound in steps 6 and 8 remain `undefined` for the lifetime of the process.

---

### Exact files involved

| File | Line | Import |
|------|------|--------|
| `controllers/user/userController.js` | 10 | `const { search } = require('../../server');` |
| `controllers/user/profileController.js` | 15 | `const { response, link } = require('../../server');` |
| `routes/userRouter.js` | 4–5 | Requires both controllers above |
| `server.js` | 13 | Requires `userRouter` |

The full circular chain:  
`server.js` → `routes/userRouter.js` → `controllers/user/userController.js` → `server.js` (loop)  
`server.js` → `routes/userRouter.js` → `controllers/user/profileController.js` → `server.js` (loop)

---

### Root cause

`server.js` only exports `module.exports = app` — it does not export `search`, `response`, or `link`. Neither of these identifiers exists anywhere in `server.js`. The imports were left over from an earlier development stage and were never cleaned up.

Verified: `search` is only used inside `userController.js` as a local search query variable (`const searchQuery = req.query.search`) — the imported `search` symbol is never called or referenced after import. Similarly `response` and `link` appear only on the import line in `profileController.js` and nowhere else in the file.

---

### Is this a guaranteed bug or only potential?

**Partially guaranteed, partially potential.**

| Aspect | Status |
|--------|--------|
| `search`, `response`, `link` are always `undefined` at runtime | **Guaranteed** |
| Circular dependency creates a partially-initialised module window | **Guaranteed** |
| Current code crashes because `search`/`response`/`link` are called | **Not currently happening** — they are never used after import |
| Future code that tries to use these values silently gets `undefined` | **Potential** |
| Module load order changes in future causing harder-to-diagnose bug | **Potential** |

The app does not crash today because the `undefined` values are simply never invoked. However:
- The circular dependency is real and confirmed. Node.js's module cache returns a partial object.
- Any developer adding code that assumes `search` or `response` has a value will get silent `undefined` bugs.
- In Node.js environments where module evaluation order may differ (bundlers, test runners, ESM interop), this can become an actual load-time failure.

---

### Risk level if modified

**Low.** The fix is removing three dead import lines. The variables being removed are never referenced after import. No logic depends on them. The circular dependency dissolves automatically once the `require('../../server')` lines are deleted.

Potential regression: None. The only risk would be if a search confirmed these were used somewhere else in the file — the search above confirmed they are not.

---

### Recommended fix approach

Remove the two dead import lines entirely:

**`controllers/user/userController.js` — remove line 10:**
```js
// DELETE this line:
const { search } = require('../../server');
```

**`controllers/user/profileController.js` — remove line 15:**
```js
// DELETE this line:
const { response, link } = require('../../server');
```

No substitution required. These variables are unused dead code. Deleting them also dissolves the circular dependency.

---
---

## BUG-005 — `couponCode` lost during Razorpay retry payment flow

---

### Exact reproduction path

1. User adds items to cart (e.g., total ₹1500) and proceeds to checkout.
2. User applies coupon code `SAVE100` (discount ₹100).
3. User selects Razorpay. Frontend calls `POST /create-razorpay-order`.
4. Server creates a Razorpay order and stores `couponCode: 'SAVE100'` in the `PaymentIntent` document.
5. Razorpay payment popup opens. User's card is declined — payment fails.
6. Frontend calls `POST /payment-failed` with `couponCode: 'SAVE100'` in the request body.
7. `paymentFailed` handler creates a new `Order` document with `couponCode: 'SAVE100'` in the constructor object.
8. **Mongoose silently drops `couponCode`** because the field is absent from `orderSchema`. The saved order has no `couponCode` stored.
9. User sees the payment-failed page and clicks "Retry Payment".
10. Frontend calls `POST /retry-razorpay-order` with `couponCode: 'SAVE100'` if the UI sends it — OR with no coupon code if the UI only reads `order.couponCode` from the server.
11. `retryRazorpayOrder` executes `couponCode || order.couponCode || ''`. Since `order.couponCode` is `undefined` (never persisted), the fallback is `''`.
12. The new Razorpay order is created with `couponCode: ''` in its notes.
13. `upsertPaymentIntent` stores `couponCode: ''` in the new `PaymentIntent`.
14. User completes payment. Webhook or `verifyRazorpayPayment` calls `fulfillCapturedPayment` with `couponCode: '' || intent.couponCode || ''` — still empty.
15. `fulfillRazorpayRetryOrder` receives `couponCode: ''` — no coupon is applied. The order is fulfilled at full price, not discounted price.

**Net result:** The user paid the correct amount (Razorpay charged the discounted amount set in step 11's `finalAmount`), but the order record shows no discount applied and `couponApplied: false`. The coupon is also not marked as used in the `Coupon.usedBy` array, so the coupon remains reusable when it should be consumed.

---

### Exact files involved

| File | Relevance |
|------|-----------|
| `models/orderSchema.js` | Missing `couponCode` field — root cause of silent data loss |
| `controllers/user/checkoutController.js` | `paymentFailed` (line ~672): sets `couponCode` on new Order constructor — silently dropped; `retryRazorpayOrder` (line ~748): reads `order.couponCode` which is always `undefined` |
| `services/orderFulfillment.js` | `fulfillRazorpayRetryOrder`: receives empty `couponCode`, skips `validateAndApplyCoupon` entirely |
| `services/razorpayFulfillment.js` | `fulfillCapturedPayment`: uses `couponCode || intent?.couponCode || ''` — falls through to empty if both are empty |
| `models/paymentIntentSchema.js` | Has `couponCode` field correctly (not the root cause) |

---

### Root cause

The root cause is a single missing field in `models/orderSchema.js`.

`couponCode` is set in two places in `checkoutController.js`:
- `paymentFailed` passes `couponCode: couponCode || null` to `new Order(...)`.
- `retryRazorpayOrder` assigns `order.couponCode = couponCode || order.couponCode || ''` and calls `order.save()`.

Both operations silently no-op because Mongoose's strict mode (the default) drops any field not declared in the schema. No error is thrown; the value simply does not persist.

The `PaymentIntent` model **does** have `couponCode` defined correctly and stores it properly. So the coupon code survives inside the `PaymentIntent` document — but only for the original payment attempt's `razorpayOrderId`. When a retry creates a **new** Razorpay order and a new `PaymentIntent`, it looks up `order.couponCode` to populate the new intent, which is `undefined` — so the new intent is also stored with an empty coupon code.

---

### Is this a guaranteed bug or only potential?

**Guaranteed** when all of the following are true (a realistic and common scenario):
- A user applies a coupon before a Razorpay payment.
- The payment fails (card declined, network error, popup closed).
- The user retries — **and** the frontend does not independently re-send the coupon code on the retry request body.

**If** the frontend re-sends `couponCode` on the `POST /retry-razorpay-order` request body from its own state (e.g. kept in a JS variable or localStorage), the coupon **will** be re-applied correctly because `retryRazorpayOrder` accepts `couponCode` from `req.body` directly. The schema issue only bites when the server needs to restore the coupon code from the persisted order, which is the fallback path `order.couponCode`.

Without inspecting the frontend JS, the server-side fallback is provably broken. The frontend-side recovery is uncertain.

---

### Risk level if modified

**Low-to-Medium.**

Adding a new field to a Mongoose schema is non-destructive — existing documents without the field will read it as `null` (the intended default). No existing queries filter or sort on `couponCode`, so adding the field cannot break any existing read path.

The only risk is if another part of the codebase explicitly checks `couponCode === undefined` (truthy/falsy) and behaves differently from `couponCode === null`. A search should be done before applying the fix to confirm no such check exists.

---

### Recommended fix approach

**Step 1 — Add `couponCode` to `orderSchema`** (the only file that must change):

```js
// In models/orderSchema.js, after the couponApplied field:
couponCode: {
    type: String,
    default: null,
},
```

This one change makes both the `paymentFailed` constructor assignment and the `retryRazorpayOrder` direct assignment persist correctly to MongoDB.

**Step 2 — Verify (no code change needed, just confirmation):**

After the schema fix, trace that `retryRazorpayOrder` correctly reads back `order.couponCode` from the now-persisted field and passes it to `upsertPaymentIntent`. The existing logic at line ~748:
```js
order.couponCode = couponCode || order.couponCode || '';
```
...already handles the fallback correctly once the schema persists the value.

**No changes needed** to `checkoutController.js`, `orderFulfillment.js`, or `razorpayFulfillment.js` — all those files already handle `couponCode` correctly in their logic. The sole failure point is the missing schema field.

---

## Summary

| Bug | Guaranteed? | Risk to fix | Files to change |
|-----|------------|-------------|-----------------|
| BUG-004 | Partially (circular dep is real; crash is not currently occurring) | Low | `userController.js` (remove 1 line), `profileController.js` (remove 1 line) |
| BUG-005 | Guaranteed when frontend relies on server-side coupon restore | Low-Medium | `models/orderSchema.js` (add 1 field) |
