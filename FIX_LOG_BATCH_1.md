# FIX LOG — Batch 1 (Critical Bugs)

> Applied: 2025-06  
> Scope: BUG-001, BUG-002, BUG-003 from SMOKE_TEST_REPORT.md  
> Files modified: 3  
> Files created: 1 (this log)

---

## BUG-001 — Wallet model not imported in `walletController.js`

**Severity:** Critical  
**File:** `controllers/user/walletController.js`

### Why it happened

`loadWallet` calls `Wallet.findOne({ userId })` and `new Wallet({ userId })` but the `Wallet` model was never imported. The file only imported `User`, `creditWallet`, and `withTransaction`. At runtime Node.js throws `ReferenceError: Wallet is not defined` the moment any logged-in user navigates to `/wallet`.

### Exact code change

```diff
  const User = require('../../models/userSchema');
+ const Wallet = require('../../models/walletSchema');
  const { creditWallet } = require('../../utils/walletOps');
  const { withTransaction } = require('../../utils/withTransaction');
```

**Line inserted:** after line 1 (`const User = ...`), before `creditWallet` import.

### How the fix solves it

`Wallet` is now in scope for the entire module. `Wallet.findOne` and `new Wallet(...)` resolve correctly at runtime. The wallet page loads as designed.

### Possible side effects

None. The `walletSchema.js` model file already exists and is used by other controllers. Adding an import to a new consumer has no effect on other modules.

---

## BUG-002 — Wallet model not imported in `checkoutController.js`

**Severity:** Critical  
**File:** `controllers/user/checkoutController.js`

### Why it happened

`loadCheckout` executes `const wallet = await Wallet.findOne({ userId })` at approximately line 88 and passes the result to the `checkout.ejs` view. `Wallet` was absent from the file's 22 import statements. Every GET `/checkout` request crashed immediately with `ReferenceError: Wallet is not defined`, blocking all payment flows (COD, Wallet, Razorpay).

### Exact code change

```diff
  const Address = require('../../models/addressSchema');
  const User    = require('../../models/userSchema');
  const Order   = require('../../models/orderSchema');
  const Cart    = require('../../models/cartSchema');
  const Coupon  = require('../../models/couponSchema');
  const Product = require('../../models/productSchema');
+ const Wallet  = require('../../models/walletSchema');
  const { assertOrderOwnership } = require('../../utils/orderAuth');
```

**Line inserted:** after `const Product = ...` (line 6), before the `assertOrderOwnership` destructure.

### How the fix solves it

`Wallet` resolves correctly when `loadCheckout` calls `Wallet.findOne`. The checkout page now renders with the user's wallet balance available to the view, as originally intended.

### Possible side effects

None. `walletSchema.js` is a stable, existing model. Adding it as an import here does not affect any other module or the model itself. `verifyRazorpayPayment` and `placeOrder` also use wallet operations — those were already routed through `walletOps` utilities, so they are unaffected.

---

## BUG-003 — `next` missing from `getAllProducts` signature in `controllers/admin/productController.js`

**Severity:** Critical  
**File:** `controllers/admin/productController.js`, function `getAllProducts`

### Why it happened

The function was declared as `async (req, res)` — only two parameters. The catch block calls `next(error)` to forward errors to Express's central error handler. Because `next` was not in the parameter list, it resolved to `undefined` in the function scope. Any database error (e.g., MongoDB connection drop, populate failure) caused a secondary `ReferenceError: next is not defined` instead of a graceful error page, and the process could crash.

### Exact code change

```diff
- const getAllProducts = async (req, res) => {
+ const getAllProducts = async (req, res, next) => {
```

**Line changed:** line 95.

### How the fix solves it

Express passes `next` as the third argument to every route handler. Declaring it in the signature makes it available inside the function. On any unhandled error in the try block, `next(error)` now correctly forwards to the Express error handler middleware (`middlewares/errorHandler.js`), which returns the appropriate error page rather than crashing.

### Possible side effects

None. Express always supplies `(req, res, next)` — adding `next` to the signature does not change how Express calls the function. It only makes an already-supplied argument accessible. All existing happy-path logic (product fetch, pagination, render) is completely unchanged.

---

## Summary

| Bug | File | Change |
|-----|------|--------|
| BUG-001 | `controllers/user/walletController.js` | Added `const Wallet = require('../../models/walletSchema');` after line 1 |
| BUG-002 | `controllers/user/checkoutController.js` | Added `const Wallet = require('../../models/walletSchema');` after `const Product` import |
| BUG-003 | `controllers/admin/productController.js` | Changed `getAllProducts` signature from `async (req, res)` to `async (req, res, next)` |

All changes are additive or minimal one-word edits. No logic was altered, no refactoring was performed, no unrelated files were touched.

---

*Awaiting approval before proceeding to Batch 2.*
