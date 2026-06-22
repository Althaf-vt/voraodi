# SMOKE TEST REPORT — Voraodi Ecommerce

> Static code analysis smoke test — all bugs identified by reading source files.
> No live server was run. Findings reflect code behaviour at rest.
> Date: 2025-06

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 4 |
| Low | 3 |
| **Total** | **15** |

---

## CRITICAL BUGS

---

### BUG-001 — `Wallet` used but never imported in `walletController.js`

**Severity:** Critical  
**Flow affected:** Wallet page load  
**File:** `controllers/user/walletController.js`

**Root cause:**  
`loadWallet` calls `Wallet.findOne({ userId })` but `Wallet` is never imported at the top of the file. The file only imports `User`, `creditWallet`, and `withTransaction`.

```js
// CURRENT top of file (3 imports only):
const User = require('../../models/userSchema');
const { creditWallet } = require('../../utils/walletOps');
const { withTransaction } = require('../../utils/withTransaction');

// loadWallet then calls:
let wallet = await Wallet.findOne({ userId });  // ReferenceError: Wallet is not defined
```

**Why it broke:** The `Wallet` model was used without being imported, so the wallet page throws a `ReferenceError` at runtime whenever a logged-in user navigates to `/wallet`.

**Fix recommendation:**  
Add the missing import at line 1:
```js
const Wallet = require('../../models/walletSchema');
```

---

### BUG-002 — `Wallet` used but never imported in `checkoutController.js`

**Severity:** Critical  
**Flow affected:** Checkout page load (all payment methods)  
**File:** `controllers/user/checkoutController.js`

**Root cause:**  
`loadCheckout` fetches `const wallet = await Wallet.findOne({ userId })` (line ~88) and passes `wallet` to the checkout view. `Wallet` is never imported in this file.

```js
// 22 imports at top of file — Wallet is absent
// Line ~88:
const wallet = await Wallet.findOne({ userId });  // ReferenceError: Wallet is not defined
```

**Why it broke:** Every GET `/checkout` request crashes before rendering the page.

**Fix recommendation:**  
Add to imports:
```js
const Wallet = require('../../models/walletSchema');
```

---

### BUG-003 — `next` is not a parameter of `getAllProducts` in admin `productController.js`, yet `next(error)` is called in the catch block

**Severity:** Critical  
**Flow affected:** Admin product listing page  
**File:** `controllers/admin/productController.js`, function `getAllProducts`

**Root cause:**  
The function signature is `async (req, res)` — only two parameters. The catch block calls `next(error)` which refers to an undefined `next`, throwing a `ReferenceError` when any error occurs inside the try block (e.g. DB connection issue).

```js
const getAllProducts = async (req, res) => {   // <-- no 'next'
    try {
        ...
    } catch (error) {
        next(error)   // ReferenceError: next is not defined
    }
};
```

**Why it broke:** Any unhandled error during product listing crashes the process rather than returning a proper error page.

**Fix recommendation:**  
Change the function signature:
```js
const getAllProducts = async (req, res, next) => {
```

---

## HIGH BUGS

---

### BUG-004 — Dead imports from `server.js` in `userController.js` and `profileController.js`

**Severity:** High  
**Flow affected:** App startup / module load  
**Files:**  
- `controllers/user/userController.js` line 10: `const { search } = require('../../server');`  
- `controllers/user/profileController.js` line 15: `const { response, link } = require('../../server');`

**Root cause:**  
`server.js` only exports `module.exports = app`. It does not export `search`, `response`, or `link`. These destructure to `undefined` silently, which means the modules load without crashing — but they create a circular dependency (`server.js` → `userRouter.js` → `userController.js` → `server.js`) that could cause subtle initialisation ordering bugs.

`search` is never used after import (its only occurrence in the file is the import itself).  
`response` and `link` are never used after import either.

**Why it broke:** The circular dependency means `server.js` is partially initialised when `userController.js` requires it. In Express 5 the import chain resolves but any future code that actually tries to use these values will get `undefined`.

**Fix recommendation:**  
Remove both dead import lines entirely:
```js
// Remove from userController.js:
// const { search } = require('../../server');

// Remove from profileController.js:
// const { response, link } = require('../../server');
```

---

### BUG-005 — `couponCode` field set on Order documents but not in the Order schema

**Severity:** High  
**Flow affected:** Retry Razorpay payment, payment-failed order creation  
**Files:**  
- `controllers/user/checkoutController.js` lines ~677, ~749: `order.couponCode = ...`  
- `models/orderSchema.js` — no `couponCode` field defined

**Root cause:**  
`retryRazorpayOrder` saves `order.couponCode = couponCode || order.couponCode || ''` and reads it back later. `paymentFailed` creates an order with `couponCode: couponCode || null` in the object passed to `new Order(...)`. Mongoose silently drops fields not in the schema, so the value is never persisted.

On a subsequent retry, `order.couponCode` is always `undefined`/`null`, breaking the coupon restoration logic.

**Fix recommendation:**  
Add the field to the order schema:
```js
couponCode: {
    type: String,
    default: null,
},
```

---

### BUG-006 — `updateQty` (cart) does not prevent decrementing below 1

**Severity:** High  
**Flow affected:** Cart quantity decrease  
**File:** `controllers/user/profileController.js`, `updateQty` function

**Root cause:**  
When `action === 'decrease'`, the handler simply does `item.quantity -= 1` without checking if it would go to 0 or below. The commented-out removal code (`userCart.items.splice(itemIndex, 1)`) was never re-enabled. An item reaches `quantity: 0`, `totalPrice: 0`, and is saved to the database. The cart then contains zero-quantity items that appear in checkout.

```js
} else if (action === 'decrease') {
    item.quantity -= 1;
    // if(item.quantity <= 0){  <-- commented out
    //     userCart.items.splice(itemIndex,1);
    // }
}
// No lower-bound guard active
```

**Fix recommendation:**  
Restore the removal guard:
```js
} else if (action === 'decrease') {
    item.quantity -= 1;
    if (item.quantity <= 0) {
        userCart.items.splice(itemIndex, 1);
        await userCart.save();
        return res.status(200).json({ success: true, removed: true, message: 'Item removed from cart' });
    }
}
```

---

### BUG-007 — `wishlistController.removeItem` uses `product._id` instead of `product.productId` to match wishlist entries

**Severity:** High  
**Flow affected:** Wishlist item removal  
**File:** `controllers/user/wishlistController.js`, `removeItem` function

**Root cause:**  
The wishlist array stores items as `{ productId, addedOn }` (subdocuments where the subdocument `_id` is auto-generated by Mongoose). The frontend is expected to send `productId` (the product's own `_id`). However, `removeItem` does:

```js
const itemIndex = wishlist.products.findIndex((product => product._id.equals(productId)));
```

`product._id` here is the **subdocument `_id`** (Mongoose auto-id for the array element), not the `product.productId` field. So if the client sends the actual product ObjectId, the `findIndex` never matches and returns `-1`, resulting in a 400 "Product not found in wishlist" error every time.

**Fix recommendation:**  
```js
const itemIndex = wishlist.products.findIndex(
    (item) => item.productId.equals(productId)
);
```

---

### BUG-008 — `getEditAddress` catch block references undefined variable `err` instead of `error`

**Severity:** High  
**Flow affected:** Address edit — any server-side error during address fetch  
**File:** `controllers/user/profileController.js`, `getEditAddress` function

**Root cause:**  
```js
} catch (error) {
    console.error('GET /address error:', err);   // <-- 'err' is undefined, 'error' is the caught variable
    res.status(500).json({ success: false, message: messages.SERVER_ERROR });
}
```

When an error is thrown inside `getEditAddress`, the catch block tries to log `err` which is not defined in scope, causing a secondary `ReferenceError`. The response still returns 500, but the original error is swallowed and a `ReferenceError: err is not defined` is thrown to the process.

**Fix recommendation:**  
```js
} catch (error) {
    console.error('GET /address error:', error);
    res.status(500).json({ success: false, message: messages.SERVER_ERROR });
}
```

---

## MEDIUM BUGS

---

### BUG-009 — Shop page sort default uses wrong field name (`createOn` vs `createdOn`)

**Severity:** Medium  
**Flow affected:** Default sort on Shop page  
**File:** `controllers/user/userController.js`, `loadShoppingPage` function

**Root cause:**  
```js
let sortOption = { createOn: -1 };   // typo — field does not exist
```

The Product schema uses Mongoose `timestamps: true` which creates `createdAt` (not `createdOn`, not `createOn`). When no sort is selected, the default sort `{ createOn: -1 }` has no effect because the field doesn't exist — MongoDB silently ignores it and returns documents in natural order instead of newest-first.

**Fix recommendation:**  
```js
let sortOption = { createdAt: -1 };
```

---

### BUG-010 — `deleteSingleImage` in admin `productController.js` builds the wrong file path for deletion

**Severity:** Medium  
**Flow affected:** Admin — delete single product image  
**File:** `controllers/admin/productController.js`, `deleteSingleImage` function

**Root cause:**  
Images are stored in the database as `/uploads/product-images/filename.png` (with a leading slash). The deletion code does:

```js
const imagePath = path.join(__dirname, '..', 'public', 'uploads', 'product-images', path.basename(imageNameToServer));
```

`__dirname` is `controllers/admin/`, so `path.join(__dirname, '..')` resolves to `controllers/`. The path then becomes `controllers/public/uploads/product-images/...` which does not exist. The actual files live at `<root>/public/uploads/product-images/`.

The code catches the unlink error with a `console.warn` so deletion fails silently — the DB record is removed but the file remains on disk.

**Fix recommendation:**  
```js
const imagePath = path.join(__dirname, '../../public/uploads/product-images', path.basename(imageNameToServer));
```

---

### BUG-011 — `paymentFailed` handler does not clear the cart when a cart is empty

**Severity:** Medium  
**Flow affected:** Razorpay payment failure flow  
**File:** `controllers/user/checkoutController.js`, `paymentFailed` function

**Root cause:**  
`paymentFailed` returns a 400 error if the cart is empty (`'Cart is empty'`). However, the correct flow is: user attempts checkout → Razorpay popup → payment fails → frontend POSTs to `/payment-failed`. At this point the cart still has items (since the order creation moves items to an order, but only on success). If the user had previously placed a successful order and the cart was somehow already cleared, hitting `/payment-failed` would return 400 instead of creating the failed order record, leaving the user with no "retry" entry point.

More critically, `paymentFailed` saves `req.session.orderSuccess = true` unconditionally, which causes the `/checkout` guard to redirect the user away from the checkout page even when a failed order wasn't properly created.

**Fix recommendation:**  
Only set `req.session.orderSuccess = true` after a successful order save:
```js
await newOrder.save();
cart.items = [];
await cart.save();
req.session.orderSuccess = true;   // move here, after save
```

---

### BUG-012 — `updateOrderStatus` in admin controller does not validate the target status value

**Severity:** Medium  
**Flow affected:** Admin order status update  
**File:** `controllers/admin/orderController.js`, `updateOrderStatus` function

**Root cause:**  
The handler accepts any `status` string from the request body and writes it directly to `order.status` without validating it against the schema enum. If the admin UI sends an invalid status (or a crafted request sends one), Mongoose will throw a validation error on `order.save()` but this is not caught gracefully — the catch block does `return res.redirect('/admin/pageError')` (HTML redirect for a JSON endpoint), which breaks the AJAX handler on the frontend.

```js
const updateStatus = order.status = status;  // no enum check
```

**Fix recommendation:**  
```js
const VALID_STATUSES = ['Pending','Processing','Shipped','Delivered','Cancelled','Return Request','Returned','Payment Failed'];
if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
}
```

Also change the catch block from `res.redirect` to `res.status(500).json(...)`.

---

## LOW BUGS

---

### BUG-013 — `hh.js` orphaned file in `controllers/user/`

**Severity:** Low  
**Flow affected:** None (dead file)  
**File:** `controllers/user/hh.js`

**Root cause:**  
A file named `hh.js` exists inside `controllers/user/` but is not imported anywhere in the route files or other controllers. It appears to be a leftover scratch file.

**Fix recommendation:**  
Delete `controllers/user/hh.js`.

---

### BUG-014 — `generate` imported from Mongoose internals in `userController.js` and `profileController.js` — unused

**Severity:** Low  
**Flow affected:** None (unused import adds confusion)  
**Files:**  
- `controllers/user/userController.js` line 1: `const { generate } = require('mongoose/lib/types/objectid');`  
- `controllers/user/profileController.js` line 15: `const { generate } = require('mongoose/lib/types/objectid');`

**Root cause:**  
`generate` is imported but never called anywhere in either file. Importing from an internal Mongoose path (`mongoose/lib/types/objectid`) is fragile and may break if Mongoose restructures internals in a patch release.

**Fix recommendation:**  
Remove both import lines.

---

### BUG-015 — `find` imported from `addressSchema` in `userController.js` — unused

**Severity:** Low  
**Flow affected:** None (unused import)  
**File:** `controllers/user/userController.js` line 12: `const { find } = require('../../models/addressSchema');`

**Root cause:**  
`Address` schema does not export a `find` function — this destructures to `undefined`. It is never used. Another dead import line.

**Fix recommendation:**  
Remove the line:
```js
// const { find } = require('../../models/addressSchema');
```

---

## Flow-Specific Smoke Test Results

### Authentication Flows

| Flow | Status | Notes |
|------|--------|-------|
| Signup (email) | ✅ Logic OK | OTP generated, stored in session, User + Wallet created on verify |
| Signup OTP verify | ✅ Logic OK | Redirects to `/signin` on success |
| Resend OTP | ✅ Logic OK | Regenerates OTP in session |
| Signin (email) | ✅ Logic OK | Sets `req.session.user` |
| Logout | ✅ Logic OK | Destroys session, redirects to `/signin` |
| Forgot password | ✅ Logic OK | 3-step session state machine enforced |
| Google OAuth signin | ✅ Logic OK | Session `user` set in callback |
| Google OAuth signup | ✅ Logic OK | Creates User + Wallet if not found |
| Blocked user check | ✅ Logic OK | `checkUserBlocked` destroys session and returns `{isBlocked: true}` |

---

### Profile Flows

| Flow | Status | Notes |
|------|--------|-------|
| View profile | ✅ Logic OK | |
| Edit name | ✅ Logic OK | |
| Edit phone | ✅ Logic OK | |
| Edit profile image | ✅ Logic OK | Multer + file cleanup |
| Change email (OTP flow) | ✅ Logic OK | 4-step session state machine |
| Change password (OTP flow) | ✅ Logic OK | 4-step session state machine |
| Address list | ✅ Logic OK | |
| Add address | ✅ Logic OK | |
| Edit address | ⚠️ BUG-008 | Error logging uses undefined `err` variable |
| Delete address | ✅ Logic OK | Uses `$pull` atomic operation |

---

### Shop Flows

| Flow | Status | Notes |
|------|--------|-------|
| Product listing | ⚠️ BUG-009 | Default sort field `createOn` is a typo — products not sorted newest-first by default |
| Search | ✅ Logic OK | `escapeRegex` used |
| Category filter | ✅ Logic OK | |
| Price filter | ✅ Logic OK | |
| Sort | ✅ Logic OK (explicit sorts) | `priceLowHigh`, `priceHighLow`, `nameAZ`, `nameZA` all correct |
| Pagination | ✅ Logic OK | 8 per page |
| Product details | ✅ Logic OK | Populated category, related products |
| Quick view | ✅ Logic OK | JSON response |

---

### Cart Flows

| Flow | Status | Notes |
|------|--------|-------|
| View cart | ✅ Logic OK | |
| Add to cart | ✅ Logic OK | Max 3 per SKU enforced |
| Update quantity (increase) | ✅ Logic OK | Stock checked |
| Update quantity (decrease) | ❌ BUG-006 | Items reach qty 0 and remain in cart |
| Remove item | ✅ Logic OK | |
| Cart count | ✅ Logic OK | |

---

### Wishlist Flows

| Flow | Status | Notes |
|------|--------|-------|
| View wishlist | ✅ Logic OK | |
| Add to wishlist | ✅ Logic OK | Blocks OOS products |
| Remove from wishlist | ❌ BUG-007 | Matches by subdocument `_id` not `productId` — always fails |
| Move to cart | ✅ Logic OK | Removes from wishlist after cart add |
| Check stock (wishlist) | ✅ Logic OK | |
| Wishlist count | ✅ Logic OK | |

---

### Checkout Flows

| Flow | Status | Notes |
|------|--------|-------|
| Load checkout (normal) | ❌ BUG-002 | `Wallet` not imported — page crashes |
| Load checkout (payment retry) | ❌ BUG-002 | Same crash |
| Apply coupon | ✅ Logic OK | Validates expiry, usage, minimum price |
| COD order | ❌ BUG-002 | Checkout page doesn't load |
| Wallet order | ❌ BUG-002 | Checkout page doesn't load |
| Razorpay order creation | ❌ BUG-002 | Checkout page doesn't load; COD won't allow order above ₹2000 |
| Razorpay verify payment | ✅ Logic OK (isolated) | HMAC checked, idempotent fulfillment |
| Payment failed handler | ⚠️ BUG-011 | `orderSuccess` session flag set before confirming order saved |
| Retry Razorpay | ⚠️ BUG-005 | `couponCode` not persisted on Order schema |
| Order success page | ✅ Logic OK | Ownership assertion present |

---

### Orders Flows

| Flow | Status | Notes |
|------|--------|-------|
| View orders list | ✅ Logic OK | |
| View order details | ✅ Logic OK | Ownership asserted |
| Cancel item | ✅ Logic OK | Transaction, stock restore, wallet refund |
| Cancel order | ✅ Logic OK | Transaction, stock restore, wallet refund |
| Return item (request) | ✅ Logic OK | Sets `Return Request` status |
| Return order (request) | ✅ Logic OK | Sets all active items to `Return Request` |
| Invoice | ✅ Logic OK | EJS render |

---

### Wallet Flows

| Flow | Status | Notes |
|------|--------|-------|
| View wallet | ❌ BUG-001 | `Wallet` not imported — page crashes with ReferenceError |
| Submit referral | ✅ Logic OK | Transaction, prevents self-referral |
| Skip referral | ✅ Logic OK | |
| User status (API) | ✅ Logic OK | |

---

### Admin Flows

| Flow | Status | Notes |
|------|--------|-------|
| Admin login | ✅ Logic OK | bcrypt compare, session set |
| Admin logout | ✅ Logic OK | Session destroyed |
| Dashboard | ✅ Logic OK | Sales data aggregation |
| PDF export | ✅ Logic OK | pdfkit stream |
| Excel export | ✅ Logic OK | ExcelJS stream |
| View customers | ✅ Logic OK | Paginated |
| Block/unblock customer | ✅ Logic OK | |
| Search customers | ✅ Logic OK | |
| Category list | ✅ Logic OK | |
| Add/edit/delete category | ✅ Logic OK | |
| Category offer | ✅ Logic OK | Cascades to products |
| Product list | ❌ BUG-003 | `next` is undefined in catch block — any DB error is unhandled |
| Add product | ✅ Logic OK | sharp resize, temp cleanup |
| Edit product | ✅ Logic OK | |
| Delete product image | ⚠️ BUG-010 | Wrong path — file not deleted from disk, silent failure |
| Block/unblock product | ✅ Logic OK | |
| Product offers | ✅ Logic OK | |
| Order list | ✅ Logic OK | |
| Order details | ✅ Logic OK | |
| Update order status | ⚠️ BUG-012 | No enum validation; catch redirects instead of JSON |
| Approve/reject return (order) | ✅ Logic OK | Transaction, stock restore, wallet credit |
| Approve/reject return (item) | ✅ Logic OK | Transaction, stock restore, wallet credit |
| Coupon CRUD | ✅ Logic OK | |

---

## Prioritised Fix Order

1. **BUG-001** — Wallet page crash (Critical)
2. **BUG-002** — Checkout page crash (Critical)
3. **BUG-003** — Admin products unhandled error (Critical)
4. **BUG-007** — Wishlist remove always fails (High)
5. **BUG-006** — Cart quantity goes to zero (High)
6. **BUG-008** — Address edit error logging ReferenceError (High)
7. **BUG-004** — Dead circular imports from server.js (High)
8. **BUG-005** — couponCode not in Order schema (High)
9. **BUG-009** — Shop default sort typo (Medium)
10. **BUG-010** — Product image delete wrong path (Medium)
11. **BUG-011** — paymentFailed session flag ordering (Medium)
12. **BUG-012** — Admin order status no validation (Medium)
13. **BUG-013** — Orphaned hh.js file (Low)
14. **BUG-014** — Unused Mongoose internal imports (Low)
15. **BUG-015** — Unused `find` import from addressSchema (Low)
