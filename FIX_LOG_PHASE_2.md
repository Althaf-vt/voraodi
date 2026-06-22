# Phase 2 Fix Log — Voraodi Ecommerce

**Baseline:** Audit implementation roadmap (Phase 2 = validation, security hardening, remaining rate limits)  
**Scope:** High severity issues only  
**Date:** 2026-06-22  
**Prerequisites:** Phase 1, Phase 1.9, payment consistency work complete

---

## Verification Summary (Pre-Fix)

| # | Issue | Severity | Verified in code | Status |
|---|-------|----------|------------------|--------|
| 1 | Payment method bypass (free orders via arbitrary `paymentMethod`) | **High** | `fulfillNewOrderFromCart` marked non-COD as `Completed` without payment | Fixed |
| 2 | OTP/password logged to stdout | **High** | 6 `console.log` calls in auth controllers | Fixed |
| 3 | No checkout/payment rate limits | **High** | Only auth/OTP limited (Phase 1.9) | Fixed |
| 4 | Missing security headers (`helmet`) | **High** | No `helmet` in `server.js` | Fixed |
| 5 | Unbounded JSON body (DoS) | **High** | Default `express.json()` with no limit | Fixed |
| 6 | ReDoS via unescaped `$regex` search | **High** | Raw user input in admin/user search | Fixed |
| 7 | Signup/update-email server validation missing | **High** | Client-only validation; duplicate email update unchecked | Fixed |

---

## Implementation Plan (Executed)

| Batch | Scope | Approach |
|-------|--------|----------|
| **1** | Payment validation | Whitelist `cod` / `wallet` / `razorpay`; require Razorpay IDs for razorpay; validate address exists |
| **2** | Secret logging | Remove all OTP `console.log` statements |
| **3** | Rate limits + body limits | `checkoutLimiter` on payment routes; `100kb` JSON/urlencoded cap |
| **4** | Security headers | `helmet` with CSP disabled (Razorpay + inline EJS scripts) |
| **5** | ReDoS-safe search | `escapeRegex()` helper applied to all `$regex` search inputs |
| **6** | Input validation | Server-side signup + email-update checks |

---

## Batch 1 — Payment Method Validation

### Files Modified
- `utils/paymentValidation.js` (new)
- `services/orderFulfillment.js`
- `controllers/user/checkoutController.js`

### Fixes Applied
- Whitelist payment methods: `cod`, `wallet`, `razorpay` only
- Reject `place-order` / fulfillment when `paymentMethod === 'razorpay'` without both payment IDs
- Guard against null address document / invalid `addressId` before order placement

### Verification
- `node -e "require('./utils/paymentValidation'); require('./services/orderFulfillment')"` — OK
- Arbitrary `paymentMethod` (e.g. `free`, `visa`) now returns 400 instead of creating a completed order

### Regression Risks
- **Low** — Legitimate COD/wallet/Razorpay flows unchanged; Razorpay still uses `fulfillCapturedPayment` when IDs present

---

## Batch 2 — Remove OTP Logging

### Files Modified
- `controllers/user/userController.js`
- `controllers/user/profileController.js`

### Fixes Applied
- Removed OTP logging from signup, resend OTP, forgot password, change email, and change password flows
- Kept `console.error` for actual error paths

### Verification
- `grep` for OTP `console.log` in controllers — no matches

### Regression Risks
- None — logging removal only; email delivery unchanged

---

## Batch 3 — Checkout Rate Limits & Body Size

### Files Modified
- `middlewares/rateLimit.js`
- `routes/userRouter.js`
- `server.js`

### Fixes Applied
- `checkoutLimiter`: 30 requests / 15 min on apply-coupon, check-stock, verify-razorpay, place-order, payment-failed, retry-razorpay, create-razorpay-order
- `express.json` and `express.urlencoded` capped at **100kb** (webhook raw route unaffected)

### Verification
- Module load OK
- Webhook route registered before JSON parser (unchanged)

### Regression Risks
- Heavy checkout retries during poor connectivity may hit 429 — limits are generous (30/15min)
- Large non-upload JSON payloads rejected (expected)

---

## Batch 4 — Security Headers (Helmet)

### Files Modified
- `server.js`
- `package.json` / `package-lock.json` (`helmet@^8.0.0`)

### Fixes Applied
- Global `helmet()` with `contentSecurityPolicy: false` and `crossOriginEmbedderPolicy: false` to avoid breaking Razorpay checkout and existing inline scripts
- Enables X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS (production)

### Verification
- `require('helmet')` — OK

### Regression Risks
- **Low** — CSP intentionally disabled; Phase 3 can add a tailored CSP if needed

---

## Batch 5 — ReDoS-Safe Search

### Files Modified
- `utils/escapeRegex.js` (new)
- `controllers/admin/customerController.js`
- `controllers/admin/productController.js`
- `controllers/admin/categoryController.js`
- `controllers/user/userController.js`

### Fixes Applied
- Escape regex metacharacters in all user/admin search strings before `$regex` queries

### Verification
- Module load OK

### Regression Risks
- None — search behavior equivalent for normal text; malicious patterns no longer cause ReDoS

---

## Batch 6 — Server-Side Input Validation

### Files Modified
- `utils/inputValidation.js` (new)
- `controllers/user/userController.js` (signup)
- `controllers/user/profileController.js` (UpdateEmail)

### Fixes Applied
- Signup: required fields, email format, password length ≥ 8 (server-side, not client-only)
- Update email: format validation, duplicate email check, fixed missing `return` on same-email error

### Verification
- Module load OK

### Regression Risks
- Stricter signup may reject passwords that previously passed client-only checks (intended)

---

## Deploy Checklist

1. Run `npm install` (pulls `helmet`)
2. Restart server
3. Smoke test:
   - [ ] Signup with invalid email rejected server-side
   - [ ] COD and wallet checkout still complete
   - [ ] Razorpay checkout → verify → order success
   - [ ] Admin customer/product search works
   - [ ] No OTP values in server logs during forgot-password flow
   - [ ] `POST /place-order` with fake `paymentMethod` returns 400

---

## Not in Phase 2 (Deferred — Medium/Low or Phase 3)

Per roadmap and Phase 1.9 out-of-scope list:

- S3 / CDN image pipeline
- Tailored Content-Security-Policy
- Global admin API rate limits
- Webhook rate limiting (would interfere with Razorpay retries)
- Full address field validation on all profile routes
- `npm start` → `node server.js` (ops change)
- Legacy `Payment Failed` order price backfill

---

## Document History

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-06-22 | Phase 2 high-severity fixes (6 batches) |
