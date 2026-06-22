# Phase 1.9 Fix Log

**Date:** 2026-05-30  
**Scope:** Remaining production risks from `FINAL_PRODUCTION_READINESS_REPORT.md` only. No Phase 2 work (e.g. S3 uploads, helmet, admin hardening beyond these items).

---

## Summary

| # | Risk | Status |
|---|------|--------|
| 1 | CSRF protection | Done |
| 2 | Rate limits on auth / OTP | Done |
| 3 | Hardcoded ngrok CORS | Removed |
| 4 | MongoDB before `app.listen` | Done |
| 5 | Multer file size limits | Done |
| 6 | Await Google OAuth wallet save | Done |
| 7 | Transactional referral credits | Done |

---

## 1. CSRF protection

**Files added**

| File | Purpose |
|------|---------|
| `middlewares/csrf.js` | Session-bound token; `attachCsrfToken` + `validateCsrf` |
| `public/re-use/csrf-client.js` | Adds `X-CSRF-Token` to `fetch` and jQuery `$.ajax` |
| `views/partials/csrf-meta.ejs` | Meta tag + client script |
| `views/partials/csrf-field.ejs` | Hidden `_csrf` for HTML forms |

**Files modified**

| File | Change |
|------|--------|
| `server.js` | `attachCsrfToken` after session; `validateCsrf` after body parsers |
| `views/partials/user/header.ejs` | Includes `csrf-meta` |
| `views/partials/admin/header.ejs` | Includes `csrf-meta` |
| Auth / profile forms | Hidden `_csrf` field where forms use native POST |

**Behavior**

- Token stored in `req.session.csrfToken` (32-byte hex).
- Validated on `POST`, `PUT`, `PATCH`, `DELETE` via body `_csrf` or header `X-CSRF-Token`.
- **`/webhooks/*` exempt** (Razorpay signature auth).
- Invalid token → `403` JSON or plain text.

**Deploy note:** Users with old sessions may need one page reload to obtain a token. All `fetch` / `$.ajax` calls on pages with `csrf-meta` send the header automatically.

---

## 2. Rate limiting (auth & OTP)

**Dependency:** `express-rate-limit@^7.5.0`

**File added:** `middlewares/rateLimit.js`

| Limiter | Window | Max | Applied to |
|---------|--------|-----|------------|
| `authLimiter` | 15 min | 20 | Sign-in/up, Google OAuth entry, forgot/reset password, change email/password (request OTP), admin sign-in |
| `otpLimiter` | 15 min | 10 | OTP verify/resend (signup, forgot password, change email/password) |

**Files modified:** `routes/userRouter.js`, `routes/adminRouter.js`

Exceeded limit → `429` with JSON `{ success: false, message: '...' }`.

---

## 3. Remove hardcoded ngrok CORS

**File modified:** `server.js`

- Removed middleware that set `Access-Control-Allow-Origin: https://ba8473fe0f2c.ngrok-free.app` on every response.
- Kept `cors()` for `https://voraodi.shop` and `http://localhost:3000`.

---

## 4. MongoDB connection before listen

**Files modified**

| File | Change |
|------|--------|
| `config/db.js` | Exported async `connectDB` (unchanged logic, removed duplicate `dotenv` import side effect) |
| `server.js` | `startServer()` awaits `connectDB()` then `app.listen()` |

Server no longer accepts HTTP traffic before MongoDB is connected.

---

## 5. Multer file size limits

**Files modified**

| File | Limit |
|------|-------|
| `middlewares/multer.js` | 5 MB per file, max 4 files (admin product images) |
| `middlewares/profileMulter.js` | 2 MB per file, max 1 file (avatar) |

Oversize uploads rejected by Multer (standard error path).

---

## 6. Google OAuth wallet creation

**File modified:** `config/passport.js`

- Changed `newWallet.save()` to `await newWallet.save()` for new Google users.

---

## 7. Transactional referral credits

**File modified:** `controllers/user/walletController.js`

- `submitReferral` wrapped in `withTransaction()`.
- Referrer update, both `creditWallet` calls, and `user.hasEnteredReferralCode` commit or roll back together.
- Requires MongoDB replica set (same as Phase 1 checkout).

---

## Verification checklist

- [ ] `npm install` (pulls `express-rate-limit`)
- [ ] Server starts only after `DB connected` log
- [ ] Sign-in / sign-up with form POST works (hidden `_csrf`)
- [ ] Checkout `fetch` works (header `X-CSRF-Token` from `csrf-client.js`)
- [ ] `POST /webhooks/razorpay` still works without CSRF token
- [ ] 11th OTP attempt in 15 min returns 429
- [ ] Avatar >2 MB or product image >5 MB rejected
- [ ] New Google user has wallet document before wallet page
- [ ] Referral submit credits both wallets or neither on forced DB error (staging)

---

## Out of scope (unchanged)

- S3 / CDN for uploads  
- Global rate limits on checkout or admin APIs  
- `helmet`, CSP, HSTS  
- CSRF on external payment redirects (N/A)  
- `npm start` still uses nodemon (ops change only)

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-05-30 | Phase 1.9 production risk fixes |
