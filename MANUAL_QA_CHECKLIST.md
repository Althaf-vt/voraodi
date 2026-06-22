# MANUAL QA CHECKLIST — Voraodi Ecommerce

> Phase: Post Batch 1 / 2A / 2B fixes  
> Type: End-to-end manual verification  
> Server must be running locally before starting.  
> Mark each item: ✅ Pass | ❌ Fail | ⚠️ Partial | — Skip

---

## Priority Order (high-risk first)

1. Checkout & Razorpay (BUG-002 fixed — was completely broken)
2. Retry payments & coupon restore (BUG-005 fixed)
3. Wallet (BUG-001 fixed — was completely broken)
4. Cart quantity (BUG-006 fixed)
5. Wishlist remove (BUG-007 fixed)
6. Authentication
7. Profile & Address
8. Orders & Returns
9. Coupons
10. Admin
11. Uploads

---

---

## 1. CHECKOUT & RAZORPAY ⚠️ Highest risk — BUG-002 was critical

### 1.1 Page load
- [ ] Navigate to `/checkout` while logged in — page renders without error
- [ ] Wallet balance is visible on the checkout page
- [ ] Saved addresses are listed
- [ ] Cart items are shown with correct prices
- [ ] Delivery charge logic: total < ₹3000 → ₹50 shown; total ≥ ₹3000 → ₹0 shown

### 1.2 COD
- [ ] Select a saved address
- [ ] Select COD payment method
- [ ] Place order — success page renders with order ID
- [ ] Order appears in `/orders` with status `Pending`
- [ ] Cart is empty after placing order
- [ ] COD blocked for order total > ₹2000: attempt such an order and confirm rejection

### 1.3 Wallet payment
- [ ] Ensure wallet has sufficient balance
- [ ] Select Wallet as payment method
- [ ] Place order — success page renders
- [ ] Wallet balance is deducted by the correct amount
- [ ] Wallet transaction appears in `/wallet` with type `debit`
- [ ] Order appears in `/orders` with status `Pending` and `paymentStatus: Completed`

### 1.4 Razorpay — success path
- [ ] Select Razorpay payment method
- [ ] Razorpay popup opens
- [ ] Complete test payment using Razorpay test credentials
- [ ] Success page renders with correct order ID
- [ ] Order appears in `/orders` with status `Pending` and `paymentStatus: Completed`
- [ ] Cart is empty after successful payment
- [ ] Stock reduced for ordered items

### 1.5 Razorpay — failure path
- [ ] Select Razorpay payment method
- [ ] Use a card that will decline (Razorpay test failure card)
- [ ] Payment fails — `/payment-failed` page renders
- [ ] Order appears in `/orders` with status `Payment Failed`
- [ ] Cart is **not** cleared (items still present for retry)
- [ ] Retry button is visible on `/payment-failed` page

---

## 2. RETRY PAYMENTS & COUPON RESTORE ⚠️ High risk — BUG-005 fixed

### 2.1 Retry without coupon
- [ ] From a `Payment Failed` order, click Retry
- [ ] Razorpay popup opens with correct amount
- [ ] Complete test payment
- [ ] Order status updates to `Pending` / `Completed`
- [ ] `/payment-failed` page no longer accessible for this order

### 2.2 Retry with coupon — core BUG-005 verification
- [ ] Add items to cart
- [ ] Apply a valid coupon at checkout — verify discount is applied
- [ ] Select Razorpay and proceed — allow payment to fail
- [ ] On `/payment-failed`, click Retry
- [ ] Confirm the Razorpay popup amount reflects the **discounted** total (same as original attempt)
- [ ] Complete the retry payment
- [ ] Verify the completed order shows `couponApplied: true` and the correct discounted `finalAmount`
- [ ] Verify the coupon code is recorded on the order (check admin order details)
- [ ] Verify the coupon is marked as used — attempting to reuse it should be rejected

### 2.3 Retry idempotency
- [ ] Completing a retry payment and then clicking retry again returns an appropriate error (order already paid)

---

## 3. WALLET ⚠️ High risk — BUG-001 fixed (page was crashing)

### 3.1 Page load
- [ ] Navigate to `/wallet` while logged in — page renders without server error
- [ ] Wallet balance is displayed correctly
- [ ] Transaction history is listed (credit/debit rows)
- [ ] Credit total and debit total are correct

### 3.2 Referral flow
- [ ] Navigate to `/wallet` as a new user who has not used a referral code
- [ ] Referral prompt appears
- [ ] Enter a valid referral code — both accounts receive the correct reward amounts (₹150 referrer, ₹100 referee)
- [ ] Enter an invalid referral code — appropriate error message shown
- [ ] Attempt to self-refer — rejected with error
- [ ] Skip referral — prompt dismisses and does not reappear

### 3.3 Wallet after refund
- [ ] Cancel a paid (non-COD) order item — wallet is credited
- [ ] Wallet transaction appears with type `credit` and correct amount

---

## 4. CART ⚠️ Medium-high risk — BUG-006 fixed (zero-quantity items)

### 4.1 Add to cart
- [ ] Add a product to cart — item appears in `/cart`
- [ ] Add same product again — quantity increases (not a duplicate row)
- [ ] Attempt to add a 4th unit of same SKU — rejected with appropriate message
- [ ] Add an out-of-stock product — rejected

### 4.2 Quantity controls — core BUG-006 verification
- [ ] Increase quantity from 1 to 2 — updates correctly
- [ ] Increase quantity from 2 to 3 — updates correctly
- [ ] Increase beyond 3 — rejected
- [ ] Decrease quantity from 3 to 2 — updates correctly
- [ ] Decrease quantity from 2 to 1 — updates correctly
- [ ] Decrease quantity from 1 — **item is removed from cart entirely** (not set to 0)
- [ ] After decreasing to removal: cart count in header updates
- [ ] Zero-quantity items must not appear in cart or checkout under any circumstances

### 4.3 Remove item
- [ ] Click remove on a cart item — item disappears from cart
- [ ] Cart total updates correctly
- [ ] Empty cart shows appropriate empty state

---

## 5. WISHLIST ⚠️ Medium-high risk — BUG-007 fixed (remove always failed)

### 5.1 Add to wishlist
- [ ] Click wishlist icon on a product — item added
- [ ] Clicking again on same product — item removed (toggle) or duplicate blocked
- [ ] Out-of-stock products can be wishlisted but not directly added to cart

### 5.2 Remove from wishlist — core BUG-007 verification
- [ ] Open `/wishlist`
- [ ] Click remove on any wishlist item — **item is removed successfully** (previously always returned 400)
- [ ] Wishlist count in header updates
- [ ] Removing last item shows empty wishlist state

### 5.3 Move to cart
- [ ] Click "Add to cart" from wishlist — item moves to cart
- [ ] Item is removed from wishlist after cart add
- [ ] If item is out of stock: appropriate message, item remains in wishlist

---

## 6. AUTHENTICATION

### 6.1 Signup
- [ ] Submit signup form with valid data — OTP email sent
- [ ] Enter correct OTP — account created, redirected to signin
- [ ] Enter incorrect OTP — error shown, can retry
- [ ] Resend OTP — new OTP delivered, old one invalidated
- [ ] Attempt signup with already-registered email — rejected

### 6.2 Signin
- [ ] Sign in with valid credentials — redirected to home
- [ ] Sign in with wrong password — error shown
- [ ] Sign in with unregistered email — error shown
- [ ] Blocked user attempts signin — rejected with blocked message

### 6.3 Logout
- [ ] Click logout — session destroyed, redirected to signin
- [ ] Navigating to protected route after logout redirects to signin (no cache hit)

### 6.4 Forgot password
- [ ] Enter registered email — OTP sent
- [ ] Enter correct OTP — new password form shown
- [ ] Set new password — can sign in with new password
- [ ] Old password no longer works after reset

### 6.5 Google OAuth
- [ ] Click "Sign in with Google" — Google consent screen opens
- [ ] Complete OAuth — redirected to home, session established
- [ ] New Google user: account and wallet created on first login
- [ ] Existing Google user: existing account used, no duplicate created

---

## 7. PROFILE & ADDRESS

### 7.1 Profile page
- [ ] `/userProfile` loads without error
- [ ] User name, email, phone displayed correctly

### 7.2 Edit profile
- [ ] Edit name — saved and reflected immediately
- [ ] Edit phone number — saved
- [ ] Upload profile image — image updated, old image cleaned from disk
- [ ] Upload a non-image file — rejected

### 7.3 Change email (OTP flow)
- [ ] Request email change — OTP sent to current email
- [ ] Verify OTP — new email form shown
- [ ] Submit new email — email updated, can sign in with new email

### 7.4 Change password (OTP flow)
- [ ] Request password change — OTP sent
- [ ] Verify OTP — new password form shown
- [ ] Submit new password — password updated

### 7.5 Address CRUD
- [ ] Add a new address — appears in address list and at checkout
- [ ] Edit an address — changes saved correctly
- [ ] Trigger an error during address fetch (e.g., invalid ID in URL) — server returns 500 JSON without secondary `ReferenceError` in logs (BUG-008 fix verification)
- [ ] Delete an address — removed from list
- [ ] Address no longer appears at checkout after deletion

---

## 8. ORDERS & RETURNS

### 8.1 View orders
- [ ] `/orders` lists all orders for the logged-in user
- [ ] Pagination works if > 5 orders
- [ ] Clicking an order opens the correct order detail page
- [ ] Cannot access another user's order detail (IDOR protection)

### 8.2 Invoice
- [ ] Click "Download Invoice" on a delivered or pending order — PDF renders
- [ ] Invoice contains correct items, amounts, address

### 8.3 Cancel item
- [ ] Cancel a single item from a multi-item order
- [ ] Item status changes to `Cancelled`
- [ ] If payment was not COD and payment was Completed: wallet refunded by item line total
- [ ] Stock restored for cancelled item
- [ ] Cancelling already-cancelled item rejected

### 8.4 Cancel order
- [ ] Cancel entire order
- [ ] All items status → `Cancelled`, order status → `Cancelled`
- [ ] Wallet refund = `finalAmount` (not `totalPrice`) for non-COD completed payments
- [ ] COD order cancellation: no wallet refund
- [ ] Stock restored for all items

### 8.5 Return item
- [ ] Request return on a delivered item — status → `Return Request`
- [ ] Admin approves return: stock restored, wallet credited
- [ ] Admin rejects return: status updated, no refund
- [ ] Cannot return a cancelled item

### 8.6 Return order
- [ ] Request full order return on a delivered order
- [ ] All active items → `Return Request`
- [ ] Admin approves: all items returned, stock + wallet updated
- [ ] Admin rejects: appropriate status shown

---

## 9. COUPONS

### 9.1 Apply coupon at checkout
- [ ] Enter a valid, active coupon code — discount applied, `finalAmount` recalculated
- [ ] Enter an expired coupon — rejected with message
- [ ] Enter a coupon below minimum order value — rejected with minimum amount message
- [ ] Enter an already-used coupon (by this user) — rejected
- [ ] Enter an invalid/nonexistent code — rejected
- [ ] Coupon discount displayed correctly in order summary

### 9.2 Coupon marked as used
- [ ] Place a successful order with a coupon
- [ ] Attempt to use the same coupon again in a new order — rejected

### 9.3 Coupon with payment failure and retry (links to section 2.2)
- [ ] See Retry Payments section 2.2 above

---

## 10. ADMIN

### 10.1 Login / logout
- [ ] Admin signin with correct credentials — redirected to dashboard
- [ ] Admin signin with wrong password — error shown
- [ ] Admin logout — session destroyed, redirected to admin signin
- [ ] Non-admin user cannot access `/admin/*` routes

### 10.2 Dashboard
- [ ] Dashboard loads with sales summary data
- [ ] Charts render
- [ ] Recent orders table visible

### 10.3 Sales report & exports
- [ ] Generate sales report for a date range — results shown
- [ ] Download PDF — file downloads, contains order data
- [ ] Download Excel — file downloads, contains order data
- [ ] `couponCode` column in PDF shows the code string (or `None`) — not `undefined` or `null` (BUG-005 fix visible here)

### 10.4 Product CRUD
- [ ] Add a new product with images — product appears in listing
- [ ] Images are resized (440×440) and stored in `uploads/product-images/`
- [ ] Edit product — changes saved
- [ ] Block product — product hidden from shop
- [ ] Unblock product — product visible in shop
- [ ] Delete product — removed from listing
- [ ] Add product offer — `salePrice` recalculated
- [ ] Remove product offer — `salePrice` restored

### 10.5 Category CRUD
- [ ] Add category — appears in listing and in shop filter
- [ ] Edit category — changes saved
- [ ] List / unlist category — products in category hidden/shown in shop
- [ ] Add category offer — cascades to all products in category
- [ ] Remove category offer — prices restored

### 10.6 Order management
- [ ] View all orders — paginated list loads
- [ ] View order detail — correct items and address shown
- [ ] Update order status (valid value) — status saved, items updated
- [ ] Approve return (order level) — stock and wallet updated
- [ ] Reject return (order level) — status updated, no wallet change
- [ ] Approve return (item level) — stock and wallet updated for that item only
- [ ] Reject return (item level) — item status updated

### 10.7 Customer management
- [ ] View customer list
- [ ] Block a customer — customer cannot sign in
- [ ] Unblock a customer — customer can sign in again
- [ ] Search customers by name/email

### 10.8 Coupon management
- [ ] Add coupon — appears in list
- [ ] Edit coupon — changes saved
- [ ] List / unlist coupon — coupon available or hidden at checkout
- [ ] Delete coupon — removed

---

## 11. UPLOADS

### 11.1 Product images
- [ ] Upload 1–4 images when adding a product — all stored correctly
- [ ] Upload more than 4 images — rejected
- [ ] Upload a non-image file as product image — rejected
- [ ] Uploaded images visible on product detail and shop pages

### 11.2 Profile images
- [ ] Upload a valid image (JPEG/PNG, ≤ 2 MB) — profile image updated
- [ ] Upload a file exceeding 2 MB — rejected with error
- [ ] Upload a non-image file — rejected
- [ ] Old profile image removed from disk after replacement

---

## 12. SHOP

### 12.1 Product listing
- [ ] `/shop` loads all listed products
- [ ] Default sort shows newest products first (BUG-009 — not yet fixed, note if still wrong order)
- [ ] Category filter narrows results correctly
- [ ] Price filter works (under ₹500, ₹500–₹1000, ₹1000–₹1500, above ₹1500)
- [ ] Text search returns matching products
- [ ] Explicit sort (Price: Low-High, High-Low, A-Z, Z-A) works
- [ ] Pagination: page 2 loads next 8 products
- [ ] Blocked products do not appear

### 12.2 Product detail
- [ ] `/productDetails/:id` loads correctly
- [ ] Related products shown
- [ ] Add to cart from product detail page works
- [ ] Add to wishlist from product detail page works
- [ ] Out-of-stock variant shows OOS state

---

## Log Column

Use this table to track results per session:

| Section | Test | Result | Notes |
|---------|------|--------|-------|
| | | | |

---

## Regression Watch List

The following were confirmed working before fixes and must remain working:

| Area | What to confirm |
|------|----------------|
| Checkout | COD still blocked above ₹2000 |
| Cart | Max 3 per SKU still enforced after BUG-006 fix |
| Wishlist | Add-to-wishlist still works after BUG-007 fix |
| Wishlist | Move-to-cart still works after BUG-007 fix |
| Address | Successful address edit still returns `{ success: true }` after BUG-008 fix |
| Orders | Cancel/return refund only for non-COD completed payments |
| Razorpay | Successful first-time payments unaffected by retry changes |
| Wallet | Referral rewards credited correctly (both referrer and referee) |
| Admin | Valid order status updates still work after (future) BUG-012 fix |

---

*No code changes are made during manual QA. Log all failures with URL, action taken, and observed error. Return findings for Batch 3 fix planning.*
