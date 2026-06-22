# Phase 1 Verification Report — Voraodi Ecommerce

**Date:** 2026-05-30 (regenerated after closure of partial items)  
**Baseline:** `AI_AUDIT_HANDOVER.md` Phase 1 scope  
**Related docs:** `FIX_LOG_PHASE_1.md`, `CREDENTIAL_ROTATION_CHECKLIST.md`

---

## Executive summary

| Category | Issues | Status |
|----------|--------|--------|
| Infrastructure | 5 | **Fully resolved** |
| Financial integrity | 6 | **Fully resolved** |
| Authorization | 6 | **Fully resolved** |
| Crash fixes | 4 | **Fully resolved** |
| **Total** | **21** | **21/21 fully resolved** (code-level) |

**Closure work (this pass):**
1. Mongoose multi-document **transactions** via `withTransaction()` for `placeOrder`, `cancelOrder` / `cancelItem`, admin return approval, and order-linked wallet/stock ops.
2. Centralized **refund/pricing** in `utils/orderPricing.js` + corrected failed-payment line totals and coupon/retry math.
3. **Credential rotation checklist** in `CREDENTIAL_ROTATION_CHECKLIST.md`.

**Deploy requirement:** MongoDB must support transactions (**replica set** or **sharded cluster**). Standalone MongoDB 4.0+ without replica set will throw transaction errors at runtime.

**Manual QA:** Still required before production (checklist at end).

---

## All files changed in Phase 1 (cumulative)

| File | Purpose |
|------|---------|
| `config/session.js` | Session store, secret validation, secure cookies |
| `server.js` | Trust proxy, `.env` path block, session wiring |
| `package.json` | `connect-mongo` |
| `views/user/checkout.ejs` | `razorpayKeyId` template variable |
| `models/walletSchema.js` | `balance` min 0 |
| `middlewares/auth.js` | Admin ID session validation |
| `routes/adminRouter.js` | `adminAuth` on Excel export |
| `controllers/admin/adminController.js` | `admin._id` in session |
| `controllers/admin/orderController.js` | Transactional return approval + pricing |
| `utils/orderAuth.js` | Ownership helper |
| `utils/walletOps.js` | Atomic debit/credit + session support |
| `utils/stockOps.js` | Atomic stock + `deductOrderItemsStock` + session |
| `utils/withTransaction.js` | **New** — Mongoose transaction wrapper |
| `utils/orderPricing.js` | **New** — Refund/totals/coupon line math |
| `services/orderFulfillment.js` | **New** — Transactional place/retry order |
| `controllers/user/checkoutController.js` | Transactions, pricing, paymentFailed fix |
| `controllers/user/orderController.js` | Transactional cancel + pricing |
| `controllers/user/walletController.js` | Referral `$inc` |
| `controllers/user/profileController.js` | Crash fixes |
| `controllers/user/productController.js` | Null product guard |
| `CREDENTIAL_ROTATION_CHECKLIST.md` | **New** — Secret rotation runbook |
| `FIX_LOG_PHASE_1.md` | Initial implementation log |

---

# Per-issue verification

---

## INF-1: `.env` exposure

**Files:** `server.js`, `views/user/checkout.ejs`, `controllers/user/checkoutController.js`, `.gitignore`

**Code:**

```25:30:server.js
app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (p === '/.env' || p.endsWith('/.env') || p.includes('.env')) {
        return res.status(404).end();
    }
```

```653:653:views/user/checkout.ejs
                        key: '<%= razorpayKeyId %>',
```

**How it works:** Secrets are not read from EJS; only the public Razorpay key ID is passed at render. HTTP paths containing `.env` are blocked.

**Resolved:** Yes.

**Edge cases:** `process.env.NODE_ENV` in error templates only. Purge `.env` from git history if it was ever committed (`CREDENTIAL_ROTATION_CHECKLIST.md`).

---

## INF-2: Session secret hardening

**Files:** `config/session.js`

**Code:**

```4:15:config/session.js
function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error(
            'SESSION_SECRET must be set in .env and be at least 32 characters long'
        );
    }
    const weak = ['your-secret-key', 'secret', 'changeme', 'session_secret'];
    if (weak.includes(secret.toLowerCase())) {
        throw new Error('SESSION_SECRET must not use a default or placeholder value');
    }
    return secret;
}
```

**Resolved:** Yes.

---

## INF-3: Mongo session store

**Files:** `config/session.js`, `server.js`

**Code:**

```32:36:config/session.js
        store: MongoStore.create({
            mongoUrl: mongoUri,
            collectionName: 'sessions',
            ttl: 72 * 60 * 60,
        }),
```

**Resolved:** Yes.

---

## INF-4: Secure cookies

**Files:** `config/session.js`

**Code:**

```37:42:config/session.js
        cookie: {
            secure: isProduction(),
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 72 * 60 * 60 * 1000,
        },
```

**Resolved:** Yes.

---

## INF-5: Trust proxy

**Files:** `server.js`

**Code:**

```17:19:server.js
if (isProduction() || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}
```

**Resolved:** Yes.

---

## FIN-1: Wallet negative balance

**Files:** `utils/walletOps.js`, `models/walletSchema.js`, `services/orderFulfillment.js`

**Code:**

```8:18:utils/walletOps.js
    const wallet = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: amount } },
        {
            $inc: { balance: -amount },
            $push: { transactions: transaction },
        },
        { new: true, ...sessionOpts(session) }
    );
```

**How it works:** Debit only succeeds if balance ≥ amount; runs inside transactions for order placement.

**Resolved:** Yes.

---

## FIN-2: Referral balance overwrite

**Files:** `controllers/user/walletController.js`, `utils/walletOps.js`

**Code:** `creditWallet` uses `$inc`; duplicate referral blocked via `hasEnteredReferralCode`.

**Resolved:** Yes.

---

## FIN-3: Stock race condition

**Files:** `utils/stockOps.js`, `services/orderFulfillment.js`

**Code:** Conditional `findOneAndUpdate` with `$elemMatch` and `$gte` quantity check.

**Resolved:** Yes (per-variant atomic updates inside transactions).

---

## FIN-4: Retry payment manipulation

**Files:** `controllers/user/checkoutController.js`, `services/orderFulfillment.js`

**Code:** `Order.findOne({ orderId, userId })`, payment-status guards, retry limited to failed orders in `retryRazorpayOrder`.

**Resolved:** Yes.

---

## FIN-5: Refund calculation bugs

**Files:** `utils/orderPricing.js`, `controllers/user/orderController.js`, `controllers/admin/orderController.js`, `controllers/user/checkoutController.js` (`paymentFailed`)

**Pricing rules:**

| Scenario | Refund / total logic |
|----------|----------------------|
| Item cancel (prepaid) | `getCancelItemRefundAmount` → line total via `getItemLineTotal` |
| Item cancel (COD) | No wallet refund (`shouldWalletRefund` false) |
| Full cancel (prepaid) | `getFullOrderCancelRefundAmount` → active lines + delivery |
| Full cancel (COD) | Totals only; no wallet credit |
| Return approval | `getReturnItemRefundAmount` / `getReturnOrderRefundAmount`; COD excluded |
| Failed payment retry | `getItemLineTotal` for legacy unit-price rows; `applyCouponToOrderLines` without `price × qty` double count |
| New failed orders | `paymentFailed` stores **line total** in `item.price` |

**Code (COD guard):**

```39:42:utils/orderPricing.js
function shouldWalletRefund(order) {
    if (order.paymentMethod === 'cod') return false;
    return order.paymentStatus === 'Completed';
}
```

**Code (failed payment line totals):**

```javascript
// checkoutController paymentFailed — price: salePrice * quantity (line total)
```

**Resolved:** Yes.

**Edge cases:** Legacy DB rows with unit prices on `Payment Failed` orders still normalized via `getItemLineTotal` until migrated.

---

## FIN-6: MongoDB transaction support

**Files:** `utils/withTransaction.js`, `services/orderFulfillment.js`, `controllers/user/checkoutController.js`, `controllers/user/orderController.js`, `controllers/admin/orderController.js`

**Code:**

```8:18:utils/withTransaction.js
async function withTransaction(fn) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    } catch (error) {
        await session.abortTransaction();
        throw error;
```

**Transactional flows:**

| Flow | Function |
|------|----------|
| New order | `fulfillNewOrderFromCart` in `placeOrder` |
| Retry order (wallet/COD) | `fulfillRetryOrder` in `placeOrder` |
| Razorpay retry complete | `fulfillRazorpayRetryOrder` in `verifyRazorpayPayment` |
| Cancel item / order | `cancelItem`, `cancelOrder` |
| Admin return approve | `approveReturnItem`, `approveReturnOrder` |

Wallet/stock helpers accept optional `session` and participate in the same transaction.

**Resolved:** Yes (requires replica set).

---

## AUTH-1 through AUTH-6: Order / cancel / return / invoice / admin / Excel

**Status:** Fully resolved (unchanged from prior pass; verified via grep and code review).

- `Order.findOne({ orderId, userId })` on user routes
- `assertOrderOwnership` on sensitive handlers
- `req.session.admin = admin._id` + `adminAuth` validates `_id` + `isAdmin`
- `router.post('/download-excel', adminAuth, ...)`

---

## CRASH-1 through CRASH-4

| Issue | Fix | Resolved |
|-------|-----|----------|
| `redirect('/singin')` | `res.redirect('/signin')` | Yes |
| Missing `next` | `getResetPassword`, `getPaymentFailed` signatures | Yes |
| Product null | Null check before `product.category` | Yes |
| Reset password handler | `next(error)` in catch | Yes |

---

# Credential exposure review

See **`CREDENTIAL_ROTATION_CHECKLIST.md`** for:

- Historical vectors (committed `.env`, EJS Razorpay key, logs, etc.)
- Step-by-step rotation for MongoDB, session, Razorpay, Google OAuth, Nodemailer, admin
- Post-rotation verification steps

---

# Static verification performed

```text
✓ grep: no singin, no req.session.admin = true
✓ grep: no process.env.RAZORPAY in EJS (only razorpayKeyId)
✓ node require: all modified modules load
✓ SESSION_SECRET validation enforced at startup
```

---

# Manual testing checklist

### Prerequisites
- [ ] MongoDB **replica set** (transactions enabled)
- [ ] `.env`: `SESSION_SECRET` (≥32), `MONGODB_URI`, Razorpay, OAuth, Nodemailer
- [ ] `TRUST_PROXY=true` if behind reverse proxy in production

### Authentication & profile
- [ ] **User signup** — register, OTP email, verify, session persists
- [ ] **User login** — email/password; blocked user rejected
- [ ] **Google OAuth login** — sign-in and sign-up callbacks
- [ ] **Profile update** — name, phone, avatar
- [ ] **Address management** — add, edit, delete; checkout uses saved address

### Shopping
- [ ] **Cart** — add, update qty, remove; stock limits enforced
- [ ] **Checkout** — totals, delivery, coupon display

### Payments
- [ ] **Razorpay payment** — widget loads; success path; signature verify; order success page
- [ ] **Wallet payment** — sufficient balance debits; insufficient balance rejects **without** negative balance
- [ ] **Failed payment retry** — failed order stores line totals; retry with coupon; stock/wallet consistent

### Orders (user)
- [ ] **Order details** — own order only; other user’s ID denied
- [ ] **Order cancellation** — partial item refund (prepaid); full cancel; COD no wallet refund
- [ ] **Return requests** — item and order return submit
- [ ] **Invoice download** — `/invoice?id=` own order only; print/PDF from browser

### Wallet & referral
- [ ] Referral code credits **add** to balance (not overwrite)
- [ ] Duplicate referral rejected

### Password reset
- [ ] Forgot password flow; no crash on invalid step (redirects to `/signin`)

### Product
- [ ] Invalid product ID → 404, no crash

### Admin
- [ ] **Admin login** — dashboard access
- [ ] **Admin dashboard** — metrics load
- [ ] **Product management** — CRUD/stock visible on storefront
- [ ] **Order management** — status updates
- [ ] **Return approval** — wallet credit (prepaid only), stock restored, transactional (no partial state on error)
- [ ] **Excel export** — only when admin authenticated

### Security spot-checks
- [ ] `GET /.env` → 404
- [ ] Checkout page source: no secret key
- [ ] Tampered `userId` in place-order body ignored

---

## Phase 1 sign-off

| Criterion | Met |
|-----------|-----|
| All 21 issues addressed in code | Yes |
| Transactions for order/wallet/stock critical paths | Yes |
| Refund math centralized and COD-safe | Yes |
| Credential rotation documented | Yes |
| Manual QA completed | Pending operator |

**Phase 2:** Do not start until manual checklist is signed off and production credentials are rotated per `CREDENTIAL_ROTATION_CHECKLIST.md`.
