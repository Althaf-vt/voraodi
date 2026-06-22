# Bugfix Requirements Document

## Introduction

Static code analysis of the Voraodi Ecommerce application (Node.js / Express 5 / MongoDB / EJS) identified 15 functional bugs across user-facing and admin flows. The bugs range from complete page crashes (missing model imports, undefined `next` parameter) to silent data corruption (wrong wishlist match key, zero-quantity cart items, coupon code not persisted). This document captures the bug conditions, expected correct behaviour, and what existing behaviour must not regress.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a logged-in user visits `/wallet` THEN the system crashes with `ReferenceError: Wallet is not defined` because `walletController.js` uses `Wallet` without importing it

1.2 WHEN a logged-in user visits `/checkout` THEN the system crashes with `ReferenceError: Wallet is not defined` because `checkoutController.js` uses `Wallet` without importing it

1.3 WHEN any database error occurs during the admin `/admin/products` page load THEN the system throws `ReferenceError: next is not defined` because `getAllProducts` is declared as `async (req, res)` without a `next` parameter but calls `next(error)` in the catch block

1.4 WHEN a user attempts to remove an item from their wishlist THEN the system returns `400 Product not found in wishlist` because `removeItem` matches on `product._id` (the Mongoose subdocument auto-id) instead of `product.productId` (the actual product reference)

1.5 WHEN a user decreases cart quantity to zero THEN the system saves a zero-quantity item to the database because the removal guard (`splice`) is commented out, and the item persists in the cart and appears at checkout

1.6 WHEN a server-side error occurs inside `getEditAddress` THEN the system throws `ReferenceError: err is not defined` because the catch block logs `err` instead of the caught variable `error`

1.7 WHEN the application boots THEN the system creates a circular dependency by importing from `server.js` in `userController.js` (`search`) and `profileController.js` (`response`, `link`), both of which resolve to `undefined` and are never used

1.8 WHEN a user retries a failed Razorpay payment and a coupon was stored with the order THEN the system silently loses the coupon code because `order.couponCode` is set in code but `couponCode` is not a field in the Order Mongoose schema, so Mongoose drops it on save

1.9 WHEN the shop page loads without an explicit sort selection THEN products are returned in natural (arbitrary) database order instead of newest-first because the default sort key is `createOn` (a non-existent field) instead of `createdAt`

1.10 WHEN an admin deletes a single product image THEN the physical file is not removed from disk because the constructed path is `controllers/public/uploads/product-images/...` instead of the correct `public/uploads/product-images/...`, and the failure is swallowed silently

1.11 WHEN a Razorpay payment fails and the cart is empty at the time the failure handler runs THEN the system sets `req.session.orderSuccess = true` before confirming that a failed-payment order was successfully saved to the database

1.12 WHEN an admin submits an invalid order status string via the API THEN the system throws a Mongoose validation error and redirects to an HTML error page instead of returning a JSON error, breaking the AJAX handler on the admin frontend

---

### Expected Behavior (Correct)

2.1 WHEN a logged-in user visits `/wallet` THEN the system SHALL load the wallet page without errors by importing `Wallet` from `../../models/walletSchema` at the top of `walletController.js`

2.2 WHEN a logged-in user visits `/checkout` THEN the system SHALL load the checkout page without errors by importing `Wallet` from `../../models/walletSchema` at the top of `checkoutController.js`

2.3 WHEN any database error occurs during the admin `/admin/products` page load THEN the system SHALL forward the error to the Express error handler by declaring `getAllProducts` as `async (req, res, next)` with the `next` parameter

2.4 WHEN a user removes a wishlist item by sending a `productId` THEN the system SHALL find and remove the correct item by matching `item.productId.equals(productId)` instead of `item._id.equals(productId)`

2.5 WHEN a user decreases cart quantity to 1 and decreases again THEN the system SHALL remove the item from the cart using `userCart.items.splice(itemIndex, 1)` and return `{ success: true, removed: true }`

2.6 WHEN any error occurs inside `getEditAddress` THEN the system SHALL log `error` (the caught variable) and return a 500 JSON response without a secondary `ReferenceError`

2.7 WHEN the application boots THEN the system SHALL NOT import `search`, `response`, or `link` from `server.js`; these lines SHALL be removed from `userController.js` and `profileController.js`

2.8 WHEN an order with a coupon code is saved to the database THEN the system SHALL persist the coupon code by adding `couponCode: { type: String, default: null }` to the Order schema

2.9 WHEN the shop page loads without an explicit sort selection THEN products SHALL be sorted by `createdAt: -1` (newest first) matching the Mongoose `timestamps: true` field name

2.10 WHEN an admin deletes a single product image THEN the system SHALL resolve the file path relative to the project root as `path.join(__dirname, '../../public/uploads/product-images', path.basename(imageNameToServer))`

2.11 WHEN a Razorpay payment fails THEN the system SHALL only set `req.session.orderSuccess = true` after the failed-payment order has been successfully saved to the database

2.12 WHEN an admin submits an order status update THEN the system SHALL validate the status value against the allowed enum before saving, and return a JSON `{ success: false, message: '...' }` response (not an HTML redirect) for both invalid input and server errors

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user with a non-empty cart visits `/checkout` AND `Wallet` is imported THEN the system SHALL CONTINUE TO display the checkout page with addresses, cart items, wallet balance, and available coupons

3.2 WHEN a user with a valid session visits `/wallet` AND `Wallet` is imported THEN the system SHALL CONTINUE TO display wallet balance, transaction history, credit/debit totals, and referral code

3.3 WHEN the admin views `/admin/products` AND `next` is a parameter THEN the system SHALL CONTINUE TO return the paginated product list with enriched `totalQuantity` per product

3.4 WHEN a user adds an item to the wishlist and the item exists THEN the system SHALL CONTINUE TO add the item; the fix to `removeItem` SHALL NOT affect add behaviour

3.5 WHEN a user increases cart quantity within the allowed maximum of 3 THEN the system SHALL CONTINUE TO enforce the maximum-3 per SKU rule

3.6 WHEN address editing succeeds without error THEN the system SHALL CONTINUE TO update the address and return `{ success: true, message: 'Address updated successfully' }`

3.7 WHEN a user places an order with COD or Wallet payment THEN the system SHALL CONTINUE TO create the order, deduct stock, and debit the wallet (wallet) or mark payment as Pending (COD)

3.8 WHEN an order with a coupon was placed AND `couponCode` is added to the schema THEN the system SHALL CONTINUE TO record `couponApplied: true/false` as before (no change to existing boolean logic)

3.9 WHEN the shop is sorted explicitly by `priceLowHigh`, `priceHighLow`, `nameAZ`, or `nameZA` THEN the system SHALL CONTINUE TO apply the selected sort correctly

3.10 WHEN an admin edits a product and replaces images THEN the system SHALL CONTINUE TO resize via sharp, store new images, and merge with existing image URLs

3.11 WHEN a Razorpay payment succeeds THEN the system SHALL CONTINUE TO verify the HMAC signature, fulfil the order idempotently, and return `{ success: true, orderId }`

3.12 WHEN an admin updates order status with a valid enum value (Shipped, Delivered, etc.) THEN the system SHALL CONTINUE TO update all non-cancelled items to the same status and save the order
