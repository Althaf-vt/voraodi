# Deployment Readiness Report — Phase 1 (Voraodi Ecommerce)

**Date:** 2026-05-30  
**Scope:** All Phase 1 security, financial, authorization, and crash fixes  
**Code changes reviewed:** Yes (read-only review; no code modified for this report)  
**Related docs:** `PHASE_1_VERIFICATION_REPORT.md`, `CREDENTIAL_ROTATION_CHECKLIST.md`, `FIX_LOG_PHASE_1.md`

---

## Deployment verdict

| Area | Ready? | Blocker? |
|------|--------|----------|
| Environment configuration | **Conditional** | Yes — `SESSION_SECRET` length/quality; optional `TRUST_PROXY` |
| Database migrations | **Mostly N/A** | No formal migrations; ops steps for sessions + data review |
| MongoDB replica set | **Required** | **Yes** — transactions fail on standalone MongoDB |
| Existing production data | **Review required** | Medium — admin sessions, legacy order pricing, wallet balances |
| Transaction architecture | **Conditional** | High — external payment vs DB transaction boundary |

**Recommendation:** Do **not** deploy to production until (1) MongoDB is confirmed as a replica set (Atlas M10+ cluster or equivalent), (2) environment variables are updated, (3) a short maintenance window is scheduled for session invalidation, and (4) post-deploy smoke tests cover checkout, cancel, and return flows.

---

## 1. Fixes that require environment changes

### 1.1 Required (application will not start or core features break)

| Variable | Phase 1 change | Requirement | If missing / wrong |
|----------|----------------|-------------|-------------------|
| `SESSION_SECRET` | Validated in `config/session.js` | **≥ 32 characters**; not in denylist (`secret`, `changeme`, etc.) | **Process throws at startup** — server does not boot |
| `MONGODB_URI` | Required for `connect-mongo` session store | Valid connection string to same DB as app data | **Process throws** when creating session middleware |

These are **new hard requirements** compared to pre–Phase 1 (weak or missing `SESSION_SECRET` may have allowed boot with in-memory sessions).

### 1.2 Required for correct production behavior

| Variable | Phase 1 change | Requirement | If missing / wrong |
|----------|----------------|-------------|-------------------|
| `NODE_ENV` | `secure: true` cookies when `production` | Set to `production` on live server | Cookies not marked `Secure` — sessions may not persist over HTTPS-only browsers |
| `TRUST_PROXY` | `server.js` enables `trust proxy` when `true` or production | Set `TRUST_PROXY=true` if behind nginx, Render, Railway, Heroku, Cloudflare, etc. | `req.secure` wrong → **secure cookies may not be set** even on HTTPS |
| `PORT` | Unchanged | App listen port | Server fails to bind |

### 1.3 Unchanged but must remain set (pre-existing)

| Variable | Used by |
|----------|---------|
| `RAZORPAY_KEY_ID` | Checkout render, Razorpay API |
| `RAZORPAY_KEY_SECRET` | Payment signature verification |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Passport Google OAuth |
| `NODEMAILER_EMAIL` / `NODEMAILER_PASSWORD` | OTP / forgot-password email |

### 1.4 Dependency install (deploy pipeline)

| Change | Action |
|--------|--------|
| New npm dependency `connect-mongo@^6.0.0` | Run `npm ci` or `npm install` on deploy host — **not** optional |

### 1.5 Recommended operational changes (not enforced in code)

| Item | Reason |
|------|--------|
| **Rotate secrets** per `CREDENTIAL_ROTATION_CHECKLIST.md` | Historical `.env` / EJS Razorpay key exposure in audit |
| Replace weak production `SESSION_SECRET` before deploy | Startup only blocks known weak strings, not all weak secrets |
| Use `node server.js` (or `node .`) in production | `package.json` `"start": "nodemon server"` is dev-oriented |

### 1.6 Environment changes **not** introduced by Phase 1

- No new env vars for transaction toggles (transactions are always used where implemented).
- Razorpay / Google / Nodemailer variable **names** unchanged.

---

## 2. Fixes that require database migrations

### 2.1 Formal migrations

**None provided in the repository.** There are no migration scripts (e.g. `migrate-mongo`, SQL files, or versioned schema updates).

### 2.2 Automatic schema / collection side effects

| Change | Mechanism | DBA action |
|--------|-----------|------------|
| **Session store** | `connect-mongo` creates/uses collection `sessions` (TTL 72h) | None required — created on first write; ensure DB user can create collections/indexes |
| **Wallet `balance` min: 0** | Mongoose schema validation on `save()` | **No migration** — does not retroactively fix negative balances in DB |
| **Order / User / Product schemas** | No field additions in Phase 1 | None |

### 2.3 Recommended data hygiene (optional, pre- or post-deploy)

| Task | Why |
|------|-----|
| Query wallets with `balance < 0` | `debitWallet` will block new debits; existing negative rows may confuse reporting |
| Audit `Payment Failed` orders | Legacy rows may store **unit** price in `item.price`; code normalizes via `getItemLineTotal()` — amounts on retry/refund may differ from historical expectations |
| Audit orders with `paymentMethod: 'cod'` and wallet credit transactions | Old bugs may have credited COD cancellations; new logic **will not** refund COD to wallet |
| Clear or ignore old in-memory sessions | N/A after deploy — all sessions move to MongoDB |

### 2.4 Indexes

- `sessions`: TTL index typically created by `connect-mongo` — verify after first deploy in Atlas UI.
- No new indexes added for orders/wallets/products in Phase 1.

---

## 3. Fixes that require MongoDB replica set support

### 3.1 Why replica set is required

Phase 1 uses `mongoose.startSession()` + `startTransaction()` in `utils/withTransaction.js`. MongoDB **multi-document transactions** require:

- Replica set (including Atlas shared clusters), or  
- Sharded cluster  

They **do not work** on a default single-node `mongod` without replica set configuration.

### 3.2 Code paths that **require** transactions at runtime

| Flow | File | User impact if transactions unsupported |
|------|------|----------------------------------------|
| Place order (cart) | `checkoutController.js` → `fulfillNewOrderFromCart` | Checkout fails — **cannot complete orders** |
| Place order (retry) | `checkoutController.js` → `fulfillRetryOrder` | Failed-payment retry checkout fails |
| Verify Razorpay (retry) | `checkoutController.js` → `fulfillRazorpayRetryOrder` | Paid retry may not finalize order |
| Cancel item | `orderController.js` | Cancellation API errors |
| Cancel order | `orderController.js` | Full cancel API errors |
| Approve return (order) | `admin/orderController.js` | Admin return approval fails |
| Approve return (item) | `admin/orderController.js` | Admin item return approval fails |

### 3.3 Code paths that do **not** use transactions

| Flow | Note |
|------|------|
| Referral submit | `walletController.js` — still multi-step without transaction |
| Return **request** (user) | Status update only |
| `applyCoupon`, `checkStock`, `createRazorpayOrder` | Pre-payment / read-mostly |
| Admin order status update | No transaction wrapper |
| User auth / profile / cart (except place order) | Unaffected |

### 3.4 How to verify production MongoDB

**MongoDB Atlas:** Default clusters are replica sets — **usually OK**.

**Self-hosted:** Run in `mongosh`:

```javascript
rs.status()
```

If error / `REPL` not set → **Phase 1 checkout and cancel will fail** with transaction errors (e.g. code 20 illegal operation).

**Staging:** Must use the same topology as production; testing against standalone local MongoDB is **not** representative.

---

## 4. Fixes that may break existing production data

### 4.1 Session and authentication (high impact, expected)

| Change | Pre-Phase 1 | Post-Phase 1 | Impact |
|--------|-------------|--------------|--------|
| Session store | In-memory (default) | MongoDB `sessions` collection | **All users and admins logged out** on deploy |
| Admin session value | `req.session.admin = true` (boolean) | `req.session.admin = admin._id` | **Existing admin browser sessions invalid** — must sign in again |
| `adminAuth` | Any `isAdmin` user if session flag set | Must match `_id` + `isAdmin` | Stricter — correct for security |

**Not data corruption** — behavioral break for active sessions only.

### 4.2 Order pricing and refunds (medium impact)

| Scenario | Risk |
|----------|------|
| Legacy `Payment Failed` orders with **unit** `item.price` | `getItemLineTotal()` multiplies by `quantity` — retry/coupon/refund math **differs** from old code that double-multiplied or under-refunded |
| New `paymentFailed` handler | Stores **line** totals — consistent going forward; **inconsistent** with old failed-payment rows |
| COD cancellation | **No wallet refund** (`shouldWalletRefund` false) — if production previously refunded COD via wallet due to bugs, behavior **stops** |
| Prepaid cancel | Refund uses line total + `computeOrderFinalAmount` — may **differ** from old `unitPrice * qty` or full `finalAmount` edge cases |
| Full order cancel | Refunds `computeOrderFinalAmount` then sets `finalAmount = 0` — generally correct; compare with orders that had partial cancellations before full cancel |

**Recommendation:** Spot-check 5–10 real production orders (COD, prepaid, failed payment, partial cancel) in staging before go-live.

### 4.3 Wallet balances (low–medium impact)

| Change | Impact |
|--------|--------|
| `balance` schema `min: 0` | Saves with negative balance may fail validation; existing negative balances remain until manual fix |
| `debitWallet` conditional update | Users with insufficient balance **cannot** complete wallet checkout (intended) |
| Referral `$inc` instead of overwrite | **Fixes** future data; does not repair past overwritten balances |

### 4.4 Stock (low impact)

| Change | Impact |
|--------|--------|
| Atomic `$inc` on variants | Prevents overselling going forward; does not reconcile historical oversell |
| Cancel/return restock in transactions | If transaction aborts, restock rolls back with cancel — **more consistent** than before |

### 4.5 Authorization (low impact for legitimate users)

| Change | Impact |
|--------|------|
| Order scoped by `userId` | Users can no longer view other users’ orders by ID — **intended**; support tools must use admin panel |
| Excel export requires `adminAuth` | Unauthenticated export no longer possible — **intended** |

### 4.6 No breaking schema changes to documents

- Existing `orders`, `users`, `wallets`, `products` documents remain readable without field migration.
- No automatic backfill of `item.price` semantics.

---

## 5. Deployment risks introduced by the transaction architecture

### 5.1 Infrastructure / topology risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Standalone MongoDB** | **Critical** | All transactional flows throw; site cannot take orders or process cancellations |
| Atlas tier / connection limits | Medium | More round-trips per checkout; session + transaction overhead |
| Transaction time limit | Medium | Default ~60s; very large carts unlikely to hit; monitor slow queries |

### 5.2 External payment vs database transaction boundary (critical business risk)

```
Customer pays Razorpay  →  (external, committed)
        ↓
Server: verify signature  →  withTransaction { update order, stock, coupon }
```

| Flow | Risk |
|------|------|
| `verifyRazorpayPayment` (retry with `orderId`) | If MongoDB transaction **fails after** Razorpay success, customer is **charged** but order may remain `Payment Failed` / stock not decremented |
| `placeOrder` (wallet / COD) | Payment not external — transaction failure means **no order** (consistent) |
| `createRazorpayOrder` + frontend flow | Normal path verifies then `placeOrder` — Razorpay verify-only path without `orderId` does not transaction-wrap order creation |

**Mitigation (operational):** Monitor failed transaction logs; manual reconciliation with Razorpay dashboard; consider idempotency keys / admin “complete order” tool (Phase 2+).

### 5.3 Concurrency and locking

| Risk | Description |
|------|-------------|
| Write contention | Hot SKUs: concurrent checkouts serialize on product variant updates — **correct** but may increase latency |
| Duplicate submit | Double-click place order: two transactions may race; one may fail on stock or coupon `usedBy` — preferable to overselling |
| Cart cleared inside transaction | `fulfillNewOrderFromCart` clears cart in same transaction as order — abort restores cart |

### 5.4 Partial failure inside transactions

| Aspect | Phase 1 behavior |
|--------|------------------|
| Stock + wallet + order + coupon | All commit or all abort **within** `withTransaction` |
| Referral rewards | **Outside** transactions — referrer saved and wallet credits not atomic with each other |
| Email / Razorpay API | External — not rolled back with MongoDB |

### 5.5 Observability gaps

- No explicit logging of `abortTransaction` reason in `withTransaction.js` — failures surface as 400/500 to client.
- Recommend alerting on repeated `Transaction numbers` / `IllegalOperation` errors (replica set misconfiguration).

### 5.6 Rollback / deploy rollback strategy

| Action | Effect |
|--------|--------|
| Roll back **code** to pre–Phase 1 | In-memory sessions return; transactional code removed; **admin sessions** still invalidated if secret/store changed |
| Roll back **SESSION_SECRET** | Invalidates all sessions again |
| Roll back **MongoDB** data | Not automated — restore from backup if bad refunds/cancels during canary |

**Prefer:** Blue/green or canary with replica-set staging parity, not code rollback after live financial traffic.

### 5.7 Other deploy-time risks (Phase 1 adjacent)

| Item | Risk |
|------|------|
| Hardcoded `Access-Control-Allow-Origin` ngrok URL in `server.js` | Stale dev URL in production responses — not introduced in Phase 1 but still present |
| `.env` path middleware blocks URLs containing `.env` | Rare false 404 on innocent paths |
| `npm start` uses `nodemon` | Unsuitable for production process managers |

---

## 6. Pre-deploy checklist (condensed)

### Environment
- [ ] `SESSION_SECRET` ≥ 32 chars, cryptographically random
- [ ] `MONGODB_URI` points to **replica set** cluster
- [ ] `NODE_ENV=production` on live
- [ ] `TRUST_PROXY=true` if behind reverse proxy
- [ ] `npm ci` includes `connect-mongo`
- [ ] Secrets rotated per `CREDENTIAL_ROTATION_CHECKLIST.md` (recommended)

### Database
- [ ] Backup MongoDB
- [ ] Confirm `rs.status()` or Atlas cluster type
- [ ] Optional: fix negative wallet balances
- [ ] Optional: document count of `Payment Failed` legacy orders

### Application
- [ ] Smoke test in **staging** with replica set: place order, wallet pay, Razorpay retry, cancel item, admin return approve
- [ ] Admin re-login after deploy
- [ ] Notify users: brief re-login required

### Post-deploy monitoring (first 24h)
- [ ] Error rate on `/place-order`, `/verify-razorpay-payment`, `/cancel-order`
- [ ] MongoDB transaction error metrics
- [ ] Razorpay settlements vs completed orders
- [ ] Wallet balance anomalies

---

## 7. Phase 2 gate

Phase 1 code is **deployment-ready only when**:

1. MongoDB replica set is confirmed.  
2. Environment variables are updated and secrets rotated as needed.  
3. Staging smoke tests pass for transactional flows.  
4. Operations accepts session logout and legacy order pricing review.  

**Do not start Phase 2** until this checklist is signed off and production monitoring is in place for the transaction + payment boundary described in §5.2.

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-05-30 | Initial deployment-readiness review (Phase 1 complete, read-only) |
