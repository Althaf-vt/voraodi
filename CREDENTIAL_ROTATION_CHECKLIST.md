# Credential Rotation Checklist — Voraodi

Use this after Phase 1 security fixes. Rotate **all** credentials that may have been exposed via git history, EJS templates, logs, or shared environments.

---

## Historical exposure risks (audit baseline)

| Secret | Exposure vector | Risk | Phase 1 mitigation |
|--------|-----------------|------|-------------------|
| `.env` file | Referenced as committed in audit handover | Critical | `.gitignore` blocks new commits; **rotate if ever pushed** |
| `SESSION_SECRET` | Weak/default in source or `.env` | Critical | Startup validation ≥32 chars; **rotate on deploy** |
| `RAZORPAY_KEY_ID` | Rendered in `checkout.ejs` via `process.env` | High (public key) | Moved to controller variable; key ID is public by design but rotate if leaked with secret |
| `RAZORPAY_KEY_SECRET` | Server-side only; risk if `.env` leaked | Critical | Never in EJS; rotate if repo/env compromised |
| `GOOGLE_CLIENT_ID` / `SECRET` | `.env`, OAuth config | High | Rotate in Google Cloud Console if `.env` leaked |
| `MONGODB_URI` | `.env` | Critical | Rotate DB user password; update URI |
| `NODEMAILER_EMAIL` / `PASSWORD` | `.env`, app passwords | High | Revoke app password; create new |
| OTP / session data | Console logs (`F-Pass-OTP`, resend OTP) | Medium | Remove log statements in Phase 2; rotate session secret |
| Admin password | DB seed / manual | High | Force password reset if DB dump leaked |

---

## Pre-rotation

- [ ] Confirm whether `.env` ever existed in git: `git log --all --full-history -- .env`
- [ ] If found in history: treat **all** env values as compromised
- [ ] Schedule maintenance window (sessions will invalidate)
- [ ] Backup MongoDB before credential changes

---

## Rotation steps (in order)

### 1. MongoDB (`MONGODB_URI`)

- [ ] Atlas/self-hosted: create new DB user with least privilege
- [ ] Update password; update connection string in production `.env`
- [ ] Revoke/delete old DB user
- [ ] Verify app connects and sessions collection works

### 2. Session (`SESSION_SECRET`)

- [ ] Generate: `openssl rand -base64 48` (or 32+ random chars)
- [ ] Set in production `.env`
- [ ] Restart app (all users/admins must re-login)
- [ ] Confirm old session cookies are rejected

### 3. Razorpay (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`)

- [ ] Razorpay Dashboard → API Keys → Regenerate **Test** and/or **Live** secret
- [ ] Update `.env` on server
- [ ] Complete one test payment in each mode
- [ ] Disable/revoke old key if dashboard allows

### 4. Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)

- [ ] Google Cloud Console → APIs & Services → Credentials
- [ ] Create new OAuth 2.0 client OR reset client secret
- [ ] Update authorized redirect URIs (`/auth/google/callback`)
- [ ] Update `.env`; test sign-in and sign-up flows

### 5. Nodemailer / Gmail (`NODEMAILER_EMAIL`, `NODEMAILER_PASSWORD`)

- [ ] Google Account → Security → App passwords
- [ ] Revoke old app password
- [ ] Create new app password; update `.env`
- [ ] Test signup OTP and forgot-password email

### 6. Application admin accounts

- [ ] Change admin user password in DB (bcrypt) or via secure admin tool
- [ ] Audit `User` collection for unexpected `isAdmin: true` rows

### 7. Optional / infrastructure

- [ ] Rotate any ngrok/static tunnel URLs if keys were shared
- [ ] Review CORS `origin` list in `server.js` for stale domains
- [ ] Enable MongoDB IP allowlist / VPC peering if not already

---

## Post-rotation verification

- [ ] Server starts with new `SESSION_SECRET` (≥32 chars)
- [ ] User login + Google OAuth work
- [ ] Checkout Razorpay test payment succeeds
- [ ] Wallet debit/credit works
- [ ] Email OTP delivery works
- [ ] Admin login + Excel export work
- [ ] No secrets in browser view-source on checkout page (only `razorpayKeyId` public key)

---

## Ongoing hygiene

- [ ] Never commit `.env` (keep in `.gitignore`)
- [ ] Use separate Razorpay test/live keys per environment
- [ ] Remove OTP/password logging in code (Phase 2)
- [ ] Run `git secrets` or GitHub secret scanning on repo
- [ ] If history contained `.env`: consider `git filter-repo` or BFG to purge (coordinate with team)

---

## Sign-off

| Item | Rotated by | Date | Verified |
|------|------------|------|----------|
| MongoDB | | | |
| SESSION_SECRET | | | |
| Razorpay | | | |
| Google OAuth | | | |
| Nodemailer | | | |
| Admin passwords | | | |
