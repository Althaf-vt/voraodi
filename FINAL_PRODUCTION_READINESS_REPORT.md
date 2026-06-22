# Final Production Readiness Report — Voraodi Ecommerce

**Date:** 2026-05-30  
**Type:** Read-only audit (no code changes)  
**Codebase state:** Phase 1 financial/auth fixes + payment consistency (Razorpay webhooks, idempotent fulfillment, reconciliation script)  
**Related docs:** `DEPLOYMENT_READINESS_REPORT.md`, `PAYMENT_CONSISTENCY_FIX_LOG.md`, `PHASE_1_VERIFICATION_REPORT.md`, `CREDENTIAL_ROTATION_CHECKLIST.md`

---

## Executive summary

The application is a **long-running Node.js/Express monolith** with **server-side sessions**, **MongoDB-backed state**, **local disk uploads**, and **Razorpay + Google OAuth**. It can run in production on a **persistent VM/container platform** (e.g. AWS EC2/ECS/Elastic Beanstalk) with a **MongoDB replica set** and correct environment configuration.

It is **not production-ready on Vercel** without a platform redesign. On AWS, **single-instance or shared storage** is required for uploads until images are moved to object storage.

Payment consistency improvements reduce orphan captures, but **Razorpay still captures funds in the browser before the server transaction commits**; webhooks and reconciliation remain required safety nets.

---

## 1. Remaining production blockers

These must be resolved or explicitly accepted before taking live payments.

| # | Blocker | Area | Why it blocks production |
|---|---------|------|---------------------------|
| B1 | **MongoDB must be a replica set** | Transactions | `utils/withTransaction.js` uses multi-document transactions for checkout, Razorpay fulfillment, cancel, and admin returns. Standalone `mongod` throws transaction errors — **orders and refunds fail**. |
| B2 | **`SESSION_SECRET` (≥32 chars) and `MONGODB_URI` required at boot** | Session | `config/session.js` throws on startup if missing/weak. Server will not start. |
| B3 | **`RAZORPAY_WEBHOOK_SECRET` + live webhook URL registered** | Razorpay / Webhooks | Without secret, `POST /webhooks/razorpay` returns **500**. If verify also fails after capture, there is no automated recovery path. |
| B4 | **`NODE_ENV=production` and `TRUST_PROXY=true` behind HTTPS reverse proxy** | Session | `secure` cookies depend on `req.secure`. Wrong proxy trust → sessions do not persist on HTTPS. |
| B5 | **Google OAuth redirect URI for production domain** | OAuth | `callbackURL: '/auth/google/callback'` must match an **exact** authorized redirect URI in Google Cloud Console (e.g. `https://voraodi.shop/auth/google/callback`). Mismatch → login broken. |
| B6 | **Vercel is not a viable target for this codebase** | Vercel | No `vercel.json`; app uses `app.listen`, EJS SSR, `connect-mongo` sessions, disk uploads, and Razorpay webhooks. Vercel serverless model does not match without rewrite. **Do not deploy here as-is.** |
| B7 | **Ephemeral / non-shared disk for uploads on scaled AWS** | AWS / Uploads | Product and profile images are written under `public/uploads/`. Multiple instances or container restarts **lose or split** image files unless EFS, S3, or single-instance deployment is used. |
| B8 | **Production process must not rely on `npm start` (nodemon)** | AWS / Ops | `package.json` runs `nodemon server`. Production should use `node server.js` under PM2/systemd/ECS — nodemon is unsuitable for stable production process management. |
| B9 | **Scheduled payment reconciliation** | Razorpay | `scripts/reconcile-razorpay-payments.js` exists but is not automated. Orphan captures after outages require **manual detection** without a cron/CI job. |

---

## 2. Remaining high-risk issues

Realistic production risks that may not prevent launch but can cause revenue loss, security incidents, or support load.

| # | Risk | Area | Impact |
|---|------|------|--------|
| H1 | **Razorpay capture is external to MongoDB transaction** | Razorpay | Customer pays in Razorpay Checkout **before** `verify-razorpay-payment` / webhook fulfillment runs. If MongoDB is unavailable or the transaction aborts (stock, coupon), money can be captured while order fulfillment fails until webhook retry or ops intervention. Mitigated by idempotent fulfillment + webhook; **not eliminated**. |
| H2 | **Webhook fulfillment failure returns HTTP 500** | Webhooks | Razorpay retries (desired), but repeated failures (bad notes, missing `PaymentIntent`, stock) need **alerting** or orphan payments accumulate. |
| H3 | **Referral rewards not transactional** | MongoDB / Wallet | `submitReferral` updates referrer and calls `creditWallet` twice without `withTransaction`. Partial failure can **double-credit or leave inconsistent referral state**. |
| H4 | **Google OAuth new-user wallet creation not awaited** | OAuth | `config/passport.js` calls `newWallet.save()` without `await`. New Google sign-ups may hit checkout/wallet before wallet document exists (partially mitigated by lazy wallet creation in `walletController`). |
| H5 | **No CSRF protection on cookie-authenticated POST routes** | Session / Security | Endpoints such as `/place-order`, `/verify-razorpay-payment`, wallet debit, and admin actions accept POST with session cookies only. Cross-site request forgery is a **realistic attack** for ecommerce. |
| H6 | **No rate limiting on sign-in, OTP, checkout, webhooks** | Security | Brute-force OTP (`req.session.userOtp`), credential guessing, and checkout abuse have no application-level throttling. |
| H7 | **Hardcoded `Access-Control-Allow-Origin` for ngrok** | `server.js` | Middleware sets `https://ba8473fe0f2c.ngrok-free.app` on **every** response. Wrong CORS header in production; potential confusion with legitimate `cors()` config for `voraodi.shop`. |
| H8 | **DB connection not gated before `app.listen`** | MongoDB | `db()` in `server.js` is async and not awaited. Early requests after deploy can hit routes **before** MongoDB is connected. |
| H9 | **Legacy `Payment Failed` order line pricing** | Data | Older rows may store unit vs line totals inconsistently. Retry/refund amounts may **differ from historical expectations** (`getItemLineTotal()` normalizes at runtime). |
| H10 | **Deploy invalidates all sessions** | Session | Move to `connect-mongo` + possible `SESSION_SECRET` change logs out **all users and admins** (expected; plan communication). |
| H11 | **Admin session now stores `admin._id`** | Session | Pre-deploy admin sessions with boolean flag are invalid — admins must re-login. |
| H12 | **Upload static mount mismatch** | Uploads | Files are stored under `public/uploads/` but `server.js` also mounts `uploads/` at project root. Served correctly via `express.static('public')` first; root `uploads/` mount is redundant and confusing for ops. |
| H13 | **Multer accepts extension/MIME only** | Uploads | No file size cap in `middlewares/multer.js` / `profileMulter.js`. Large uploads risk **disk exhaustion** on small instances. |
| H14 | **Secrets rotation if previously exposed** | Ops | Audit documented Razorpay key exposure in EJS history. Live keys should be rotated per `CREDENTIAL_ROTATION_CHECKLIST.md` before high-traffic launch. |

---

## 3. Required infrastructure configuration

### 3.1 Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGODB_URI` | **Yes** | Atlas or self-hosted **replica set**. Same DB for app data and `sessions` collection. |
| `SESSION_SECRET` | **Yes** | ≥32 characters, cryptographically random; not placeholder values. |
| `NODE_ENV` | **Yes** (prod) | Set to `production` on live. |
| `TRUST_PROXY` | **Yes** (if behind proxy) | `true` on AWS ALB, nginx, Cloudflare, Render, etc. |
| `PORT` | **Yes** | Listen port for the process manager. |
| `RAZORPAY_KEY_ID` | **Yes** | Checkout and API. |
| `RAZORPAY_KEY_SECRET` | **Yes** | Checkout signature verification. |
| `RAZORPAY_WEBHOOK_SECRET` | **Yes** (prod) | From Razorpay Dashboard → Webhooks. |
| `GOOGLE_CLIENT_ID` | **Yes** | OAuth. |
| `GOOGLE_CLIENT_SECRET` | **Yes** | OAuth. |
| `NODEMAILER_EMAIL` | **Yes** | OTP / password reset. |
| `NODEMAILER_PASSWORD` | **Yes** | App password or SMTP secret. |

### 3.2 MongoDB

- **Topology:** Replica set (MongoDB Atlas default clusters qualify).
- **Collections created at runtime:** `sessions` (TTL ~72h via `connect-mongo`), `paymentintents`, `paymentevents`, plus existing app collections.
- **Indexes:** Ensure unique indexes build on `orders.razorpayPaymentId` (sparse) and `paymentevents.eventId` on first deploy (Mongoose may auto-create).
- **Backup:** Enable continuous backup (Atlas) or scheduled snapshots before go-live.

### 3.3 Razorpay

| Item | Configuration |
|------|----------------|
| Webhook URL | `https://<production-domain>/webhooks/razorpay` |
| Events | `payment.captured` (minimum) |
| Webhook secret | Set as `RAZORPAY_WEBHOOK_SECRET` |
| Live vs test | Separate keys and webhooks per mode |
| Reconciliation | Cron: `node scripts/reconcile-razorpay-payments.js --days=7` (daily recommended) |

### 3.4 Google OAuth

- Authorized JavaScript origins: `https://<production-domain>`
- Authorized redirect URI: `https://<production-domain>/auth/google/callback`
- OAuth consent screen in **Production** status before public launch.

### 3.5 Session architecture (current)

| Setting | Value | Production note |
|---------|-------|-----------------|
| Store | `connect-mongo` → `sessions` | Survives process restarts |
| Cookie `secure` | `true` when `NODE_ENV=production` | Requires HTTPS + correct `trust proxy` |
| Cookie `httpOnly` | `true` | Good |
| Cookie `sameSite` | `lax` | OK for same-site checkout |
| TTL | 72 hours | Aligns with cookie `maxAge` |

### 3.6 AWS deployment (recommended pattern)

| Component | Recommendation |
|-----------|----------------|
| Compute | EC2, ECS (Fargate), or Elastic Beanstalk running **one long-lived Node process** per instance |
| Process | `node server.js` via PM2, systemd, or ECS task definition — **not** nodemon |
| Load balancer | ALB with HTTPS termination; target group health check on HTTP |
| Proxy | Set `TRUST_PROXY=true` |
| Uploads | **Option A:** Single instance. **Option B:** EFS mount at `public/uploads`. **Option C (best):** S3 + CDN (not implemented in code today) |
| Networking | Security group: allow 443 from ALB only; restrict MongoDB Atlas IP access list |
| Secrets | SSM Parameter Store or Secrets Manager — not committed `.env` |
| Logs | CloudWatch agent or ECS log driver → stdout/stderr from Node |

**Not in repository:** Dockerfile, Terraform, Elastic Beanstalk config, or ECS task definitions — these must be supplied by ops.

### 3.7 Vercel deployment

| Requirement | Current status |
|-------------|----------------|
| Serverless/API route adapter | **Not present** |
| Stateless uploads | **Incompatible** (disk writes) |
| Persistent sessions + webhooks | **Poor fit** for serverless cold starts |
| MongoDB transactions from serverless | Possible but needs connection pooling discipline |

**Verdict:** Do not deploy this repository to Vercel without architectural changes.

### 3.8 File uploads (current behavior)

| Type | Storage path | URL path |
|------|--------------|----------|
| Product images | `public/uploads/product-images/` | `/uploads/product-images/...` |
| Profile avatars | `public/uploads/profile-images/` | `/uploads/profile-images/...` |
| Temp (admin) | `public/uploads/temp/` | Internal only |

Ops must ensure `public/uploads/**` exists on disk with write permissions and backup strategy.

---

## 4. Recommended monitoring and alerting

Focus on failures that directly affect payments, sessions, and data integrity.

### 4.1 Application / HTTP alerts

| Signal | Threshold / condition | Action |
|--------|----------------------|--------|
| 5xx rate on `/verify-razorpay-payment` | Spike above baseline | Payment fulfillment failing after capture |
| 5xx rate on `/webhooks/razorpay` | Any sustained increase | Webhook secret, DB, or stock/coupon errors |
| 5xx rate on `/place-order` | Spike | Transaction or validation failures |
| 4xx/5xx on `/auth/google/callback` | Spike | OAuth misconfiguration |
| Startup crash loop | Process exit on boot | Usually `SESSION_SECRET` / `MONGODB_URI` validation |

### 4.2 MongoDB alerts

| Signal | Condition |
|--------|-----------|
| Transaction errors | Log messages containing `Transaction`, `IllegalOperation`, code 20 |
| Connection failures | `DB connection error` from `config/db.js` |
| Replication lag | Atlas alert if secondary lag high (if using non-primary reads) |

### 4.3 Payment / business alerts

| Signal | Source | Condition |
|--------|--------|-----------|
| Reconciliation failures | `reconcile-razorpay-payments.js` exit code **1** | Captured payments without completed orders |
| `PaymentEvent` failures | `paymentevents` collection `status: 'failed'` | Webhook fulfillment errors |
| Pending intents with capture | Reconciliation output `pendingIntentsWithCapture` | Checkout context lost but money captured |
| Razorpay dashboard vs DB | Daily job comparing settlement count to `paymentStatus: Completed` razorpay orders | Unexplained drift |

### 4.4 Session / auth monitoring

| Signal | Condition |
|--------|-----------|
| Login failure rate | Spike on `/signin`, Google callback failures |
| Session store errors | `connect-mongo` connection errors in logs |

### 4.5 Infrastructure (AWS)

| Signal | Condition |
|--------|-----------|
| CPU / memory | Sustained high on checkout instances |
| Disk usage | `public/uploads` partition >80% |
| ALB unhealthy targets | Any unhealthy host |
| SSL certificate expiry | ACM cert <30 days |

### 4.6 Log fields to retain (minimum)

- `razorpayPaymentId`, `razorpayOrderId`, `orderId`, `userId` on payment routes
- Webhook `eventId`, `eventType`, fulfillment error message
- MongoDB transaction abort reason (currently generic — grep stack traces)

### 4.7 Pre-launch smoke tests (staging with replica set + live-like env)

- [ ] User email/password login and session persistence across restart
- [ ] Google OAuth sign-in and sign-up
- [ ] Razorpay checkout → single completed order with `razorpayPaymentId` set
- [ ] Duplicate verify / webhook does not double-charge stock
- [ ] Payment-failed retry flow
- [ ] Wallet and COD `place-order`
- [ ] Cancel item / cancel order (prepaid)
- [ ] Admin return approval
- [ ] Admin product image upload visible at public URL
- [ ] Webhook test from Razorpay Dashboard
- [ ] Reconciliation script exits 0 after test payments

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-05-30 | Final production readiness audit (read-only) |
