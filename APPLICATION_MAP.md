# APPLICATION MAP — Voraodi Ecommerce

> Auto-generated from static code analysis of all routes, controllers, middleware, views, and models.
> Date: 2025-06
> Stack: Node.js / Express 5 / MongoDB (Mongoose) / EJS / Passport.js / Razorpay

---

## Global Middleware Stack (server.js — applied to every request)

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | `helmet` | Security headers (CSP disabled) |
| 2 | `methodOverride('_method')` | PUT/PATCH/DELETE via `_method` query param |
| 3 | `express.raw` (webhooks only) | Raw body for `/webhooks/*` |
| 4 | `express.json` / `express.urlencoded` | Body parsing (100 kb limit) |
| 5 | `.env` path guard | Blocks requests to `/.env` variants |
| 6 | `createSessionMiddleware()` | connect-mongo backed sessions |
| 7 | `passport.initialize` + `passport.session` | Google OAuth + session deserialization |
| 8 | `attachCsrfToken` | Generates/attaches CSRF token to `res.locals` |
| 9 | `validateCsrf` | Rejects mutating requests with invalid CSRF token |
| 10 | `cache-control: no-store` | Prevents caching of all responses |
| 11 | `cors` | Allows `voraodi.shop` + `localhost:3000` |
| 12 | `express.static` | Serves `public/` and `uploads/` |

---

## 1. Authentication Module

### Routes → Controllers → Middleware → Views → Models

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/signup` | `userController.loadSignup` | — | `signup.ejs` | — |
| POST | `/signup` | `userController.signup` | `authLimiter` | `signup.ejs` (error) | `User` |
| POST | `/otp-verification` | `userController.otpVerification` | `otpLimiter` | — (JSON) | `User`, `Wallet` |
| POST | `/resend-otp` | `userController.resendOtp` | `otpLimiter` | — (JSON) | — |
| GET | `/signin` | `userController.loadSignin` | — | `signin.ejs` | — |
| POST | `/signin` | `userController.signin` | `authLimiter` | `signin.ejs` (error) | `User` |
| GET | `/logout` | `userController.logout` | — | — (redirect) | — |
| GET | `/auth/google/signin` | Passport Google OAuth | `authLimiter` | — | — |
| GET | `/auth/google/signup` | Passport Google OAuth | `authLimiter` | — | — |
| GET | `/auth/google/callback` | Passport callback → session set | — | — (redirect) | `User`, `Wallet` |
| GET | `/handle-auth-failure` | Inline handler | — | `signin.ejs` or `signup.ejs` | — |
| GET | `/check-user-blocked` | `userController.checkUserBlocked` | — | — (JSON) | `User` |

**Middleware detail:**
- `authLimiter`: 20 req / 15 min window
- `otpLimiter`: 10 req / 15 min window
- CSRF token required for POST `/signup`, POST `/signin`

**Session fields set:**
- `req.session.user` = User `_id` (on successful signin / Google OAuth)
- `req.session.userOtp`, `req.session.userData` (during signup OTP flow)

---

## 2. Profile Module

### Routes → Controllers → Middleware → Views → Models

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/userProfile` | `profileController.userProfile` | `userAuth` | `profile.ejs` | `User` |
| GET | `/account` | `profileController.userAccount` | `userAuth` | `userAccount.ejs` | `User` |
| PATCH | `/edit-profile/name` | `profileController.changeName` | `userAuth` | — (JSON) | `User` |
| PATCH | `/edit-profile/phone` | `profileController.changePhone` | `userAuth` | — (JSON) | `User` |
| PATCH | `/edit-profile/image` | `profileController.editImage` | `userAuth`, `profileMulter.single('avatar')` | — (JSON) | `User` |
| GET | `/change-email` | `profileController.changeEmail` | `userAuth` | `change-email.ejs` | `User` |
| POST | `/change-email` | `profileController.changeEmailValid` | `userAuth`, `authLimiter` | `change-email.ejs` (error) | `User` |
| GET | `/verify-email-otp` | `profileController.emailOtpPage` | `userAuth` | `change-email-otp.ejs` | `User` |
| POST | `/verify-email-otp` | `profileController.verifyOtp` | `userAuth`, `otpLimiter` | `new-email.ejs` | `User` |
| POST | `/update-email` | `profileController.UpdateEmail` | `userAuth` | `new-email.ejs` (error) | `User` |
| GET | `/change-password` | `profileController.changePassword` | `userAuth` | `change-password.ejs` | `User` |
| POST | `/change-password` | `profileController.changePasswordValid` | `userAuth`, `authLimiter` | `change-password.ejs` (error) | `User` |
| GET | `/verify-change-pass-otp` | `profileController.passOtpPage` | `userAuth` | `change-pass-otp.ejs` | `User` |
| POST | `/verify-change-pass-otp` | `profileController.verifyChangePassOtp` | `userAuth`, `otpLimiter` | `new-password.ejs` | `User` |
| POST | `/update-password` | `profileController.UpdatePassword` | `userAuth` | `new-password.ejs` (error) | `User` |
| GET | `/forgot-password` | `profileController.getForgotPassword` | — | `forgot-password.ejs` | — |
| POST | `/forgot-password` | `profileController.forgotEmailValid` | `authLimiter` | `forgot-password.ejs` (error) | `User` |
| GET | `/forgot-pass-otp` | `profileController.forgotPassOtp` | — | `forgotPass-otp.ejs` | — |
| POST | `/forgot-pass-otp` | `profileController.verifyForgotPassOtp` | `otpLimiter` | — (JSON) | — |
| POST | `/resend-forgot-otp` | `profileController.resendOtp` | `otpLimiter` | — (JSON) | — |
| GET | `/reset-password` | `profileController.getResetPassword` | — | `reset-password.ejs` | — |
| POST | `/reset-password` | `profileController.NewPassword` | `authLimiter` | `reset-password.ejs` | `User` |

**Session state machine (forgot-password flow):**
`forgot-pass` → `forgot-pass-otp` → `reset-pass` → (cleared)

**Upload:** `profileMulter` — stores to `public/uploads/profile-images/`, max 2 MB, images only.

---

## 3. Address Module

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/userAddress` | `profileController.addresses` | `userAuth` | `address.ejs` | `User`, `Address` |
| POST | `/add-address` | `profileController.postAddAddress` | `userAuth` | — (JSON) | `Address` |
| GET | `/get-address/:id` | `profileController.getEditAddress` | `userAuth` | — (JSON) | `Address` |
| PATCH | `/edit-address/:id` | `profileController.editAddress` | `userAuth` | — (JSON) | `Address` |
| DELETE | `/delete-address` | `profileController.deleteAddress` | `userAuth` | — (JSON) | `Address` |

**Address schema:** subdocument array inside single `Address` document per user (`userId` index). Each address has: `name, country, state, city, street, pincode, phone, altPhone`.

---

## 4. Shop Module

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/` | `userController.loadHomepage` | — | `home.ejs` | `User`, `Category`, `Product` |
| GET | `/shop` | `userController.loadShoppingPage` | — | `shop.ejs` | `User`, `Category`, `Product` |
| GET | `/productDetails/:id` | `productController.productDetails` | — | `product-details.ejs` | `User`, `Product`, `Category` |
| GET | `/quickView` | `productController.quickView` | — | — (JSON) | `Product` |
| GET | `/about` | `userController.aboutPage` | — | `about.ejs` | — |
| GET | `/contact` | `userController.contactPage` | — | `contact.ejs` | — |

**Shop query parameters:** `category` (comma-separated IDs), `sort` (priceLowHigh/priceHighLow/nameAZ/nameZA), `priceFilter` (under500/500to1000/1000to1500/above1500), `query` (text search), `page` (default 1).

**Pagination:** 8 products per page.

---

## 5. Cart Module

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/cart` | `profileController.loadCart` | `userAuth` | `cart.ejs` | `User`, `Cart` |
| GET | `/cart/count` | `userController.cartCount` | — | — (JSON) | `Cart` |
| GET | `/addToCart` | `profileController.addToCart` | `userAuth` | — (JSON) | `Product`, `Cart` |
| POST | `/cart/update-quantity` | `profileController.updateQty` | `userAuth` | — (JSON) | `Cart`, `Product` |
| POST | `/cart/remove-item` | `profileController.removeItem` | `userAuth` | — (JSON) | `Cart` |

**Cart rules:** max 3 qty per SKU; blocks blocked products; validates variant stock on add.

---

## 6. Wishlist Module

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/wishlist` | `wishlistController.loadWishlist` | `userAuth` | `wishlist.ejs` | `User`, `Wishlist` |
| GET | `/wishlist/count` | `userController.wishlistCount` | — | — (JSON) | `Wishlist` |
| POST | `/addToWishlist` | `productController.addToWishlist` | `userAuth` | — (JSON) | `Product`, `Wishlist` |
| POST | `/wishlist/addTocart` | `wishlistController.addToCart` | `userAuth` | — (JSON) | `Product`, `Cart`, `Wishlist` |
| PATCH | `/wishlist-remove-item` | `wishlistController.removeItem` | `userAuth` | — (JSON) | `Wishlist` |
| POST | `/check-qty` | `wishlistController.checkStock` | `userAuth` | — (JSON) | `Product` |

---

## 7. Checkout Module

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/checkout` | `checkoutController.loadCheckout` | `userAuth` | `checkout.ejs` | `User`, `Address`, `Cart`, `Wallet`, `Coupon`, `Order`, `Product` |
| POST | `/cart/check-stock` | `checkoutController.checkStock` | `userAuth`, `checkoutLimiter` | — (JSON) | `Cart`, `Product` |
| POST | `/apply-coupon` | `checkoutController.applyCoupon` | `userAuth`, `checkoutLimiter` | — (JSON) | `Coupon`, `Cart`, `Order` |
| POST | `/create-razorpay-order` | `checkoutController.createRazorpayOrder` | `userAuth`, `checkoutLimiter` | — (JSON) | `Cart`, `Coupon`, `PaymentIntent` |
| POST | `/verify-razorpay-payment` | `checkoutController.verifyRazorpayPayment` | `userAuth`, `checkoutLimiter` | — (JSON) | `Order`, `Cart`, `Coupon`, `Product`, `Wallet`, `PaymentIntent` |
| POST | `/place-order` | `checkoutController.placeOrder` | `userAuth`, `checkoutLimiter` | — (JSON) | `Order`, `Cart`, `Address`, `Coupon`, `Product`, `Wallet` |
| GET | `/order-success/:id` | `checkoutController.orderSuccess` | `userAuth` | `orderSuccess.ejs` | `User`, `Order` |
| POST | `/payment-failed` | `checkoutController.paymentFailed` | `userAuth`, `checkoutLimiter` | — (JSON) | `Order`, `Cart`, `Address` |
| GET | `/payment-failed` | `checkoutController.getPaymentFailed` | `userAuth` | `payment-failed.ejs` | `Order`, `User` |
| POST | `/retry-razorpay-order` | `checkoutController.retryRazorpayOrder` | `userAuth`, `checkoutLimiter` | — (JSON) | `Order`, `Coupon`, `PaymentIntent` |

**Payment Methods:** `cod` (max ₹2000), `wallet`, `razorpay`  
**Delivery Charge Logic:** free if subtotal ≥ ₹3000, else ₹50  
**COD restriction:** blocked if recalculated total > ₹2000

**Services used:**
- `services/orderFulfillment.js` — `fulfillNewOrderFromCart`, `fulfillRetryOrder`
- `services/razorpayFulfillment.js` — `fulfillCapturedPayment`, `upsertPaymentIntent`

---

## 8. Orders Module (User)

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/orders` | `profileController.orderPage` | `userAuth` | `order.ejs` | `User`, `Order` |
| GET | `/order-details/:id` | `orderController.orderDetailpage` | `userAuth` | `orderDetails.ejs` | `User`, `Order` |
| POST | `/cancel-item` | `orderController.cancelItem` | `userAuth` | — (JSON) | `Order`, `Product`, `Wallet` |
| POST | `/cancel-order` | `orderController.cancelOrder` | `userAuth` | — (JSON) | `Order`, `Product`, `Wallet` |
| POST | `/return-item` | `orderController.returnItem` | `userAuth` | — (JSON) | `Order` |
| POST | `/return-order` | `orderController.returnOrder` | `userAuth` | — (JSON) | `Order` |
| GET | `/invoice` | `orderController.invoice` | `userAuth` | `invoice.ejs` | `Order`, `User` |

**Refund logic:**
- Wallet refund only if `paymentStatus === 'Completed'` AND `paymentMethod !== 'cod'`
- Item cancel refund = item line total
- Full order cancel = `computeOrderFinalAmount` (active items + delivery charge)

---

## 9. Wallet Module

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/wallet` | `walletController.loadWallet` | `userAuth` | `wallet.ejs` | `User`, `Wallet` |
| POST | `/submit-referral` | `walletController.submitReferral` | `userAuth` | — (JSON) | `User`, `Wallet` |
| GET | `/api/user/status` | `walletController.userStatus` | `userAuth` | — (JSON) | `User` |
| POST | `/skip-referral` | `walletController.skipRefer` | `userAuth` | — (JSON) | `User` |

---

## 10. Admin — Authentication & Dashboard

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/admin/signin` | `adminController.loadAdminSignin` | — | `adminSignin.ejs` | — |
| POST | `/admin/signin` | `adminController.signin` | `authLimiter` | `adminSignin.ejs` (error) | `User` |
| GET | `/admin/` | `adminController.loadDashboard` | `adminAuth` | `dashboard.ejs` | `Order`, `User`, `Product`, `Category` |
| POST | `/admin/sales-report` | `adminController.saleReport` | `adminAuth` | — (JSON redirect) | `Order` |
| POST | `/admin/download-pdf` | `adminController.downloadPDF` | `adminAuth` | — (PDF stream) | `Order` |
| POST | `/admin/download-excel` | `adminController.downloadExcel` | `adminAuth` | — (XLSX stream) | `Order` |
| GET | `/admin/logout` | `adminController.logout` | — | — (redirect) | — |

**Session:** `req.session.admin` = admin User `_id`

---

## 11. Admin — Customer Management

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/admin/users` | `customerController.customerInfo` | `adminAuth` | `customers.ejs` | `User` |
| GET | `/admin/blockCustomer` | `customerController.customerBlocked` | `adminAuth` | — (JSON) | `User` |
| GET | `/admin/unblockCustomer` | `customerController.customerUnblocked` | `adminAuth` | — (JSON) | `User` |
| GET | `/admin/searchCustomer` | `customerController.seachCustomer` | `adminAuth` | `customers.ejs` | `User` |

---

## 12. Admin — Category Management

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/admin/category` | `categoryController.categoryInfo` | `adminAuth` | `category.ejs` | `Category` |
| POST | `/admin/addCategory` | `categoryController.addCategory` | `adminAuth` | — (JSON) | `Category` |
| POST | `/admin/addCategoryOffer` | `categoryController.addCategoryOffer` | `adminAuth` | — (JSON) | `Category`, `Product` |
| POST | `/admin/removeCategoryOffer` | `categoryController.removeCategoryOffer` | `adminAuth` | — (JSON) | `Category`, `Product` |
| GET | `/admin/listCategory` | `categoryController.getListCategory` | `adminAuth` | — (JSON) | `Category` |
| GET | `/admin/unlistCategory` | `categoryController.getUnlistCategory` | `adminAuth` | — (JSON) | `Category` |
| GET | `/admin/editCategory` | `categoryController.getEditCategory` | `adminAuth` | `edit-category.ejs` | `Category` |
| POST | `/admin/editCategory/:id` | `categoryController.editCategory` | `adminAuth` | — (JSON) | `Category` |
| GET | `/admin/deleteCategory` | `categoryController.deleteCategory` | `adminAuth` | — (JSON) | `Category` |
| GET | `/admin/searchCategory` | `categoryController.searchCategory` | `adminAuth` | `category.ejs` | `Category` |

---

## 13. Admin — Product Management

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/admin/products` | `productController.getAllProducts` | `adminAuth` | `products.ejs` | `Product`, `Category` |
| GET | `/admin/addProduct` | `productController.getAddProduct` | `adminAuth` | `add-product.ejs` | `Category` |
| POST | `/admin/addProduct` | `productController.addProduct` | `adminAuth`, `upload.array('images', 4)` | — (JSON) | `Product`, `Category` |
| POST | `/admin/addProductOffer` | `productController.addProductOffer` | `adminAuth` | — (JSON) | `Product`, `Category` |
| POST | `/admin/removeProductOffer` | `productController.removeProductOffer` | `adminAuth` | — (JSON) | `Product`, `Category` |
| GET | `/admin/blockProduct` | `productController.blockProduct` | `adminAuth` | — (JSON) | `Product` |
| GET | `/admin/unblockProduct` | `productController.unblockProduct` | `adminAuth` | — (JSON) | `Product` |
| GET | `/admin/editProduct` | `productController.getEditProduct` | `adminAuth` | `edit-product.ejs` | `Product`, `Category` |
| POST | `/admin/editProduct/:id` | `productController.editProduct` | `adminAuth`, `upload.array('productImages', 4)` | — (JSON) | `Product` |
| POST | `/admin/deleteImage` | `productController.deleteSingleImage` | `adminAuth` | — (JSON) | `Product` |
| GET | `/admin/deleteProduct` | `productController.deleteProduct` | `adminAuth` | — (redirect) | `Product` |
| GET | `/admin/searchProduct` | `productController.searchProduct` | `adminAuth` | `products.ejs` | `Product`, `Category` |

**Upload flow:** `multer` → temp `public/uploads/temp/` → `sharp` resize (440×440) → `public/uploads/product-images/`.

---

## 14. Admin — Order Management

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/admin/orders` | `orderController.loadOrders` | `adminAuth` | `orders.ejs` | `Order` |
| GET | `/admin/orderDetails` | `orderController.orderDetails` | `adminAuth` | `order-Details.ejs` | `Order`, `Product` |
| POST | `/admin/updateOrderStatus` | `orderController.updateOrderStatus` | `adminAuth` | — (JSON) | `Order` |
| POST | `/admin/approveReturnOrder` | `orderController.approveReturnOrder` | `adminAuth` | — (JSON) | `Order`, `Product`, `Wallet` |
| POST | `/admin/rejectReturnOrder` | `orderController.rejectReturnOrder` | `adminAuth` | — (JSON) | `Order` |
| PATCH | `/admin/approve-return-item` | `orderController.approveReturnItem` | `adminAuth` | — (JSON) | `Order`, `Product`, `Wallet` |
| PATCH | `/admin/reject-return-item` | `orderController.rejectReturnItem` | `adminAuth` | — (JSON) | `Order` |

---

## 15. Admin — Coupon Management

| Method | Route | Controller | Middleware | View | Models |
|--------|-------|-----------|-----------|------|--------|
| GET | `/admin/coupons` | `couponController.getAllCoupons` | `adminAuth` | `coupon-list.ejs` | `Coupon` |
| GET | `/admin/add-coupon` | `couponController.getAddCoupon` | `adminAuth` | `add-coupon.ejs` | — |
| POST | `/admin/add-coupon` | `couponController.addCoupon` | `adminAuth` | — (JSON) | `Coupon` |
| GET | `/admin/getCoupon/:id` | `couponController.getEditCoupon` | `adminAuth` | — (JSON) | `Coupon` |
| PATCH | `/admin/edit-coupon` | `couponController.editCoupon` | `adminAuth` | — (JSON) | `Coupon` |
| DELETE | `/admin/delete-coupon` | `couponController.deleteCoupon` | `adminAuth` | — (JSON) | `Coupon` |
| PATCH | `/admin/coupon-list-unlist` | `couponController.listUnlist` | `adminAuth` | — (JSON) | `Coupon` |

---

## 16. Webhook

| Method | Route | Controller | Middleware | Models |
|--------|-------|-----------|-----------|--------|
| POST | `/webhooks/razorpay` | `razorpayWebhookController.handleRazorpayWebhook` | `express.raw`, HMAC signature verify | `PaymentEvent`, `Order`, `Cart`, `Coupon`, `Product`, `Wallet`, `PaymentIntent` |

**CSRF exempt** (path starts with `/webhooks`).

---

## 17. Data Models Summary

| Model File | Collection | Key Fields |
|-----------|-----------|-----------|
| `userSchema.js` | `users` | `name, email, phone, googleId, password, isBlocked, isAdmin, referralCode, hasEnteredReferralCode` |
| `productSchema.js` | `products` | `productName, description, category(ref), regularPrice, salePrice, productOffer, appliedOffer, variants[], productImage[], isBlocked` |
| `categorySchema.js` | `categories` | `name, description, isListed, categoryOffer` |
| `cartSchema.js` | `carts` | `userId(ref), items[{productId, sku, size, quantity, price, totalPrice}], deliveryCharge` |
| `orderSchema.js` | `orders` | `orderId, userId(ref), orderedItems[], totalPrice, discount, finalAmount, address, status, paymentMethod, paymentStatus, razorpayPaymentId, razorpayOrderId, deliveryCharge` |
| `addressSchema.js` | `addresses` | `userId(ref), address[{name, country, state, city, street, pincode, phone, altPhone}]` |
| `walletSchema.js` | `wallets` | `userId(ref), balance, transactions[]` |
| `whishlistSchema.js` | `wishlists` | `userId(ref), products[{productId, addedOn}]` |
| `couponSchema.js` | `coupons` | `name, code, amount, minimumPrice, expireOn, isListed, isPublic, maxUsage, usedBy[]` |
| `paymentEventSchema.js` | `paymentevents` | `eventId(unique), eventType, status, payload, razorpayPaymentId, razorpayOrderId` |
| `paymentIntentSchema.js` | `paymentintents` | `razorpayOrderId(unique), userId, addressId, couponCode, amountPaise, flow, appOrderId, status` |
| `bannerSchema.js` | `banners` | (unused in routes currently) |

---

## 18. Utility & Service Layer

| File | Purpose |
|------|---------|
| `utils/escapeRegex.js` | Sanitises user input for MongoDB `$regex` |
| `utils/inputValidation.js` | Email and password format checks |
| `utils/orderAuth.js` | `assertOrderOwnership` — prevents IDOR on orders |
| `utils/orderPricing.js` | Refund calculations, line total normalisation, coupon distribution |
| `utils/paymentValidation.js` | Validates payment method enum and Razorpay credential presence |
| `utils/razorpayClient.js` | Singleton Razorpay instance |
| `utils/razorpayWebhook.js` | HMAC signature verification (webhook + checkout) |
| `utils/stockOps.js` | Atomic stock decrement/increment via MongoDB `$inc` |
| `utils/walletOps.js` | Atomic wallet credit/debit via MongoDB `findOneAndUpdate` |
| `utils/withTransaction.js` | MongoDB session transaction wrapper |
| `services/orderFulfillment.js` | New cart order + retry order fulfillment logic |
| `services/razorpayFulfillment.js` | Idempotent Razorpay capture fulfillment |
