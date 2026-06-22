# COUPON_CODE_IMPACT_CHECK.md

> Verification before adding `couponCode` field to `orderSchema.js`.  
> Question: does any code depend on `couponCode === undefined` or `!couponCode` behaving differently from `couponCode === null`?  
> Date: 2025-06

---

## All `couponCode` occurrences in source files (`.js` and `.ejs`)

| File | Line(s) | Usage pattern |
|------|---------|---------------|
| `controllers/user/checkoutController.js` | 218 | `const { couponCode } = req.body` — destructure from request |
| `controllers/user/checkoutController.js` | 294 | `couponCode` passed to `fulfillNewOrderFromCart` |
| `controllers/user/checkoutController.js` | 340 | `couponCode` passed to `fulfillCapturedPayment` |
| `controllers/user/checkoutController.js` | 400 | `const { addressId, couponCode } = req.body` |
| `controllers/user/checkoutController.js` | 427 | `if (couponCode)` — falsy guard |
| `controllers/user/checkoutController.js` | 448 | `couponCode: couponCode \|\| ''` — passed to Razorpay notes |
| `controllers/user/checkoutController.js` | 456 | `couponCode` passed to `upsertPaymentIntent` |
| `controllers/user/checkoutController.js` | 515 | `couponCode` destructured from `req.body` |
| `controllers/user/checkoutController.js` | 540 | `couponCode` passed to `fulfillCapturedPayment` |
| `controllers/user/checkoutController.js` | 617 | `const { addressId, paymentMethod, couponCode } = req.body` |
| `controllers/user/checkoutController.js` | 678 | `couponCode: couponCode \|\| null` — passed to `new Order(...)` |
| `controllers/user/checkoutController.js` | 700 | `const { orderId, couponCode } = req.body` |
| `controllers/user/checkoutController.js` | 722 | `if (couponCode)` — falsy guard |
| `controllers/user/checkoutController.js` | 743 | `couponCode: couponCode \|\| order.couponCode \|\| ''` — Razorpay notes |
| `controllers/user/checkoutController.js` | 750 | `order.couponCode = couponCode \|\| order.couponCode \|\| ''` |
| `controllers/user/checkoutController.js` | 757 | `couponCode: couponCode \|\| order.couponCode \|\| ''` — to `upsertPaymentIntent` |
| `controllers/razorpayWebhookController.js` | 29 | `couponCode: notes.couponCode \|\| ''` — from Razorpay notes |
| `services/orderFulfillment.js` | 17–18 | `validateAndApplyCoupon(couponCode, ...)` — `if (!couponCode)` falsy guard |
| `services/orderFulfillment.js` | 64, 153, 242 | `if (couponCode)` — falsy guard before applying |
| `services/razorpayFulfillment.js` | 98, 136 | `couponCode \|\| intent?.couponCode \|\| ''` — OR chain |
| `services/razorpayFulfillment.js` | 168 | `couponCode: couponCode \|\| ''` — to `upsertPaymentIntent` |
| `models/paymentIntentSchema.js` | 20 | Schema field: `type: String, default: ''` |
| `controllers/admin/adminController.js` | 285 | `couponCode: order.couponApplied \|\| 'None'` — sales report mapper (reads `couponApplied`, not `couponCode`) |
| `controllers/admin/adminController.js` | 646 | `order.couponCode \|\| 'None'` — PDF export fallback |
| `views/admin/dashboard.ejs` | 148 | `<%= order.couponCode %>` — direct EJS interpolation |
| `views/user/checkout.ejs` | 610, 626, 632, 673, 705, 735 | Frontend JS — reads from DOM input, not from server order object |

---

## Explicit null / undefined / typeof checks — NONE FOUND

The following patterns were searched across all `.js` files and returned **zero matches**:

| Pattern searched | Result |
|-----------------|--------|
| `couponCode === null` | **0 matches** |
| `couponCode === undefined` | **0 matches** |
| `couponCode !== null` | **0 matches** |
| `couponCode !== undefined` | **0 matches** |
| `typeof couponCode` | **0 matches** |

---

## Analysis of every usage pattern

### 1. Falsy guards — `if (couponCode)` and `if (!couponCode)`

Used in:
- `validateAndApplyCoupon`: `if (!couponCode) return { discount: 0, ... }`
- `fulfillRetryOrder`: `if (couponCode) { ... apply coupon ... }`
- `fulfillNewOrderFromCart`: `if (couponCode) { ... apply coupon ... }`
- `fulfillRazorpayRetryOrder`: `if (couponCode) { ... apply coupon ... }`
- `createRazorpayOrder`: `if (couponCode) { ... get discount ... }`
- `retryRazorpayOrder`: `if (couponCode) { ... get discount ... }`

**Verdict: Safe.**  
All these guards are falsy checks (`if (!couponCode)` / `if (couponCode)`). Both `null` and `undefined` are falsy — behaviour is identical for both values. Changing the schema default from no-field (resulting in `undefined`) to `default: null` does not alter the outcome of any of these checks.

---

### 2. OR-chain fallbacks — `couponCode || order.couponCode || ''`

Used in `retryRazorpayOrder` (lines 743, 750, 757):
```js
couponCode: couponCode || order.couponCode || ''
```

**Verdict: Safe.**  
`null || ''` evaluates to `''`, same as `undefined || ''`. Behaviour is identical.

---

### 3. OR-chain with empty string default — `couponCode || ''`

Used in `upsertPaymentIntent`, `razorpayWebhookController`, `razorpayFulfillment`.

**Verdict: Safe.**  
`null || ''` and `undefined || ''` both evaluate to `''`. No difference.

---

### 4. Constructor assignment — `couponCode: couponCode || null`

In `paymentFailed` → `new Order({ ..., couponCode: couponCode || null })`.

**Verdict: Safe and in fact this is the exact pattern that becomes meaningful after the fix.**  
Currently Mongoose silently drops this field because it's not in the schema. After adding `couponCode: { type: String, default: null }` to the schema, `null` will be stored correctly. No behavioural change anywhere — the `null` was always the intended stored value for "no coupon applied".

---

### 5. `order.couponCode || 'None'` in PDF export (`adminController.js` line 646)

**Verdict: Safe.**  
`null || 'None'` evaluates to `'None'`, exactly the same as `undefined || 'None'`. The PDF export will display `'None'` for orders with no coupon — same as before, just now it reads an actual `null` from the DB instead of an absent field.

---

### 6. `<%= order.couponCode %>` in `dashboard.ejs` line 148

EJS interpolates the value directly. Currently the field doesn't exist on the Order model, so this renders as empty string (EJS treats `undefined` as `''`). After the fix, it will render `null` as the string `"null"` — **this is a potential display issue**.

**However:** looking at the data mapper in `adminController.js` line 285:
```js
couponCode: order.couponApplied || 'None'
```
The sales report JS object that feeds the dashboard table maps `couponCode` to `order.couponApplied` (a boolean), not `order.couponCode`. So the dashboard table cell will show `true`, `false`, or `'None'` — the same as before. The `order.couponCode` field is used directly only in the PDF export, where the `|| 'None'` guard handles `null` correctly.

**Verdict: Safe.** The dashboard uses `order.couponApplied` for that column, not the raw `couponCode` field. The PDF fallback handles `null` cleanly.

---

### 7. `views/user/checkout.ejs` — frontend JavaScript

All occurrences are local JS variables reading from DOM input elements, not from a server-rendered order object. Not affected by the schema change.

---

## Conclusion

**No code anywhere in the codebase depends on `couponCode === undefined` or treats `null` differently from `undefined`.**

Every consumer of `couponCode` on an `Order` document uses either:
- A falsy guard (`if (couponCode)`, `if (!couponCode)`) — `null` and `undefined` are identical
- An OR-chain fallback (`|| ''` or `|| 'None'`) — `null` and `undefined` are identical

**The schema change is safe to proceed.**

---

*Proceeding to Batch 2B implementation.*
