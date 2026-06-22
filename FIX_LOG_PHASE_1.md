# Phase 1 Fix Log — Voraodi Ecommerce

**Baseline:** `AI_AUDIT_HANDOVER.md` (Phase 1 scope only)  
**Verified against codebase:** 2026-05-30  
**Status:** Phase 1 complete (pending runtime QA with valid `.env`)

---

## Verification Summary (Pre-Fix)

| Category | Issue | Verified in code | Status |
|----------|--------|------------------|--------|
| Infrastructure | `.env` / secrets in EJS | `checkout.ejs` used `process.env.RAZORPAY_KEY_ID` | Fixed |
| Infrastructure | Weak in-memory session | `server.js` default session, no Mongo store | Fixed |
| Infrastructure | `secure: false` cookies | `server.js` | Fixed (prod + trust proxy) |
| Infrastructure | No trust proxy | Missing | Fixed |
| Financial | Wallet negative balance | `$inc` without floor check | Fixed |
| Financial | Referral overwrite | `refereeWallet.balance = reward` | Fixed (`$inc`) |
| Financial | Stock race | read-modify-write on variants | Fixed (atomic `$elemMatch`) |
| Financial | Retry payment IDOR | `Order.findOne({ orderId })` only | Fixed |
| Financial | Refund bugs | COD path double-discount; item refund math | Fixed (partial) |
| Financial | MongoDB transactions | Not used | Addressed via atomic ops* |
| Authorization | Order/cancel/return/invoice | No `userId` on queries | Fixed |
| Authorization | Admin auth boolean | `req.session.admin = true` + any admin user | Fixed |
| Authorization | Excel export | No `adminAuth` on route | Fixed |
| Crash | `redirect('/singin')` | `profileController.js:92` | Fixed |
| Crash | `getResetPassword` wrong param | `(req, res, error)` | Fixed |
| Crash | Product null deref | `product.category` before null check | Fixed |
| Crash | `getPaymentFailed` uses `next` without param | Missing `next` in signature | Fixed |

\*Full multi-document transactions require a MongoDB replica set. Phase 1 uses atomic `findOneAndUpdate` for stock/wallet instead, which is safe on standalone instances.

---

## Implementation Plan (Executed)

### Batch 1 — Infrastructure
**Files:** `config/session.js`, `server.js`, `views/user/checkout.ejs`, `models/walletSchema.js`, `package.json` (connect-mongo already present)

**Strategy:**
- Centralize session config with `connect-mongo`, secret validation (≥32 chars), production secure cookies, `sameSite: 'lax'`.
- Enable `trust proxy` when `NODE_ENV=production` or `TRUST_PROXY=true`.
- Block HTTP requests for `.env` paths.
- Pass `razorpayKeyId` from controller render — never expose env in EJS.

**Side effects:** Server will **fail to start** if `SESSION_SECRET` is missing or &lt;32 characters. Update `.env` before deploy.

### Batch 2 — Crash Fixes
**Files:** `controllers/user/profileController.js`, `controllers/user/productController.js`, `controllers/user/checkoutController.js` (`getPaymentFailed`)

### Batch 3 — Authorization
**Files:** `middlewares/auth.js`, `controllers/admin/adminController.js`, `routes/adminRouter.js`, `utils/orderAuth.js`, `controllers/user/orderController.js`, `controllers/user/checkoutController.js` (order views / payment flows)

### Batch 4 — Financial Integrity
**Files:** `utils/walletOps.js`, `utils/stockOps.js`, `controllers/user/walletController.js`, `controllers/user/checkoutController.js`, `controllers/user/orderController.js`

---

## Batch 1 — Results

### Files Modified
- `config/session.js` (new)
- `server.js`
- `views/user/checkout.ejs`
- `models/walletSchema.js`

### Fixes Applied
- MongoDB session store via `connect-mongo`
- Session secret hardening at startup
- Secure cookies in production + trust proxy
- `.env` path blocking middleware
- Razorpay public key passed as `razorpayKeyId` template variable
- Wallet schema `balance` minimum 0

### Verification
- `node -e "require('./config/session')"` — loads when env valid
- Grep: no `process.env.RAZORPAY` in EJS templates

### Regression Risks
- Existing sessions invalidated on deploy (new store + secret rules)
- Local dev over HTTP: `secure` cookies only when `NODE_ENV=production`

---

## Batch 2 — Results

### Files Modified
- `controllers/user/profileController.js`
- `controllers/user/productController.js`
- `controllers/user/checkoutController.js`

### Fixes Applied
- `res.redirect('/signin')` typo fix
- `getResetPassword(req, res, next)` signature fix
- Product null check before accessing `product.category`
- `getPaymentFailed(req, res, next)` signature fix

### Verification
- Grep: no `singin` in JS sources
- Module load test passed

### Regression Risks
- Low — behavior matches intended redirects

---

## Batch 3 — Results

### Files Modified
- `middlewares/auth.js`
- `controllers/admin/adminController.js`
- `routes/adminRouter.js`
- `utils/orderAuth.js` (new)
- `controllers/user/orderController.js`
- `controllers/user/checkoutController.js`

### Fixes Applied
- `adminAuth` validates `req.session.admin` as admin user `_id`
- Admin signin stores `admin._id` in session
- `adminAuth` on `/admin/download-excel`
- Order detail, cancel, return, invoice, order success, payment-failed scoped by `userId`
- Payment retry/verify scoped to session user

### Verification
- Grep: `download-excel` route includes `adminAuth`
- Grep: no `req.session.admin = true`

### Regression Risks
- **Breaking:** Existing admin sessions (boolean `true`) must sign in again
- Users cannot view other users’ orders by ID enumeration (403/404)

---

## Batch 4 — Results

### Files Modified
- `utils/walletOps.js` (new)
- `utils/stockOps.js` (new)
- `controllers/user/walletController.js`
- `controllers/user/checkoutController.js`
- `controllers/user/orderController.js`

### Fixes Applied
- Wallet debit requires `balance >= amount` (conditional update)
- Referral rewards use `$inc` (no balance overwrite); duplicate referral blocked
- Atomic stock decrement/increment on variants
- `placeOrder` uses `req.session.user` (not body `userId`)
- Retry flows require failed-payment state + ownership
- `verifyRazorpayPayment` blocks double completion; atomic stock on retry
- Cancel refunds use line `item.price`; COD totals aligned with prepaid path
- Cancel order idempotency + ownership

### Verification
- Module load test passed
- Code review: wallet/referral/stock paths use atomic helpers

### Regression Risks
- Wallet payments fail loudly when balance insufficient (correct behavior)
- Retry only allowed for `Payment Failed` / `Failed` status — edge cases with legacy orders may need manual handling
- Stock rollback on wallet failure is best-effort (`incrementVariantStock` loop)

---

## Deploy Checklist

1. Set in `.env`:
   - `SESSION_SECRET=` (random, ≥32 characters)
   - `MONGODB_URI=`
   - `NODE_ENV=production` on live server
   - `TRUST_PROXY=true` if behind nginx/Render/Heroku
2. Confirm `.env` is **not** committed (already in `.gitignore`).
3. Re-login all users and admins after deploy.
4. Smoke test: checkout (Razorpay), wallet pay, cancel item, referral code, admin Excel export.

---

## Not in Phase 1 (Deferred)

Per handover: Phase 2/3 items (validation, CSRF, rate limits, image pipeline, etc.) are intentionally untouched.
