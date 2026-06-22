# FIX LOG — Batch 2B (High Bugs: Circular Imports + couponCode Schema)

> Applied: 2025-06  
> Scope: BUG-004, BUG-005 from SMOKE_TEST_REPORT.md  
> Pre-fix verification: COUPON_CODE_IMPACT_CHECK.md (no unsafe dependencies found)  
> Files modified: 3  
> Files created: 1 (this log)

---

## BUG-004 — Dead circular imports from `server.js`

**Severity:** High  
**Files changed:**
- `controllers/user/userController.js`
- `controllers/user/profileController.js`

### Why it happened

During development, two dead import lines were left in the user-facing controllers that required symbols from `server.js` — symbols that were never exported:

- `userController.js` line 10: `const { search } = require('../../server');`
- `userController.js` line 11: `const { find } = require('../../models/addressSchema');`
- `profileController.js` line 15: `const { response, link } = require('../../server');`

`server.js` exports only `module.exports = app`. It never exports `search`, `response`, or `link`. The `addressSchema` module exports a Mongoose model, not a `find` function.

These imports created a **circular dependency**:
```
server.js → routes/userRouter.js → controllers/user/userController.js → server.js (loop)
server.js → routes/userRouter.js → controllers/user/profileController.js → server.js (loop)
```

Because Node.js returns a partially-initialised `{}` when `server.js` is re-entered mid-load, all four destructured values (`search`, `find`, `response`, `link`) resolved permanently to `undefined`. The app did not crash because none of these variables were ever called after import — they were pure dead code.

### Exact code changes

**`controllers/user/userController.js` — removed 2 lines:**
```diff
  const bcrypt = require('bcrypt');
- const { search } = require('../../server');
- const { find } = require('../../models/addressSchema');
  const mongoose = require('mongoose');
```

**`controllers/user/profileController.js` — removed 1 line:**
```diff
  const { generate } = require('mongoose/lib/types/objectid');
- const { response, link } = require('../../server');
  const Product = require('../../models/productSchema');
```

### How the fix solves it

Removing the three `require` lines eliminates both circular dependency chains. Node.js no longer re-enters `server.js` during controller loading. The module load graph is now acyclic for these files.

### Possible side effects

None. All four removed symbols (`search`, `find`, `response`, `link`) were confirmed by grep to be referenced only on their import lines and never used anywhere else in their respective files. Their values were permanently `undefined` — removing them changes nothing at runtime.

---

## BUG-005 — `couponCode` field missing from Order schema

**Severity:** High  
**File changed:** `models/orderSchema.js`

### Pre-fix verification result

A full codebase search (`COUPON_CODE_IMPACT_CHECK.md`) confirmed:
- Zero occurrences of `couponCode === undefined`
- Zero occurrences of `couponCode === null`
- Zero occurrences of `couponCode !== undefined` / `couponCode !== null`
- Zero occurrences of `typeof couponCode`

Every consumer of `couponCode` on an Order document uses either falsy guards (`if (couponCode)`) or OR-chain fallbacks (`|| ''`, `|| 'None'`). Both `null` and `undefined` are falsy and both evaluate identically in OR-chains. The schema change is safe.

### Why it happened

The `couponCode` field was written to Order documents in two places in `checkoutController.js`:
1. `paymentFailed` — `new Order({ ..., couponCode: couponCode || null })`
2. `retryRazorpayOrder` — `order.couponCode = couponCode || order.couponCode || ''`

But `couponCode` was never declared in `orderSchema.js`. Mongoose's strict mode (the default) silently discards any field not in the schema on both `new Model({...})` construction and `document.save()`. No error was thrown — the value was simply never persisted.

On a retry, `order.couponCode` was always `undefined` regardless of what had been set, breaking the coupon restoration fallback in `retryRazorpayOrder` and causing the coupon to go unrecorded (neither applied nor marked as used in `Coupon.usedBy`).

### Exact code change

**`models/orderSchema.js` — added 4 lines after the `couponApplied` field:**
```diff
      couponApplied: {
          type: Boolean,
          default: false
      },
+     couponCode: {
+         type: String,
+         default: null,
+     },
      paymentMethod: {
```

### How the fix solves it

With the field declared in the schema:
- `paymentFailed`: `new Order({ couponCode: 'SAVE100' })` now persists `'SAVE100'` to MongoDB.
- `retryRazorpayOrder`: `order.couponCode = couponCode || order.couponCode || ''` followed by `order.save()` now correctly writes the coupon code back to the database.
- On a subsequent retry, `order.couponCode` resolves to the previously stored string rather than `undefined`, and the OR-chain `couponCode || order.couponCode || ''` correctly recovers the coupon code to pass to `upsertPaymentIntent` and `fulfillRazorpayRetryOrder`.

### Possible side effects

- **Existing Order documents in MongoDB:** Documents created before this fix have no `couponCode` field. Mongoose will return `null` for this field (the schema default) when reading those documents — same as the falsy guard expects. No migration needed.
- **PDF export (`adminController.js` line 646):** `order.couponCode || 'None'` — `null || 'None'` = `'None'`. Unchanged behaviour.
- **Dashboard EJS (`order.couponCode`):** The data mapper feeding the dashboard table uses `order.couponApplied || 'None'` (a boolean field), not the raw `couponCode` field. Not affected.
- **All fulfillment services:** All falsy guards and OR-chains behave identically with `null` vs the previous `undefined`.

---

## Summary

| Bug | Files changed | Change |
|-----|--------------|--------|
| BUG-004 | `controllers/user/userController.js` | Removed `require('../../server')` and `require('../../models/addressSchema')` (dead imports, circular deps) |
| BUG-004 | `controllers/user/profileController.js` | Removed `require('../../server')` (dead import, circular dep) |
| BUG-005 | `models/orderSchema.js` | Added `couponCode: { type: String, default: null }` field |

Pre-fix impact check completed and documented in `COUPON_CODE_IMPACT_CHECK.md`. No unsafe `null`/`undefined` distinctions found anywhere in the codebase.

---

*Awaiting approval before proceeding to Batch 3 (Medium bugs).*
