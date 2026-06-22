# BATCH 3 PLAN — Medium & Low Bug Investigation

> Investigation only — no code was modified.  
> Source: SMOKE_TEST_REPORT.md (remaining Medium and Low bugs)  
> Date: 2025-06

---

## Remaining bugs in scope

| Bug ID | Severity | Original description |
|--------|----------|---------------------|
| BUG-009 | Medium | Shop default sort uses `createOn` instead of `createdAt` |
| BUG-010 | Medium | `deleteSingleImage` builds wrong file path — file not deleted from disk |
| BUG-011 | Medium | `paymentFailed` sets `orderSuccess` session flag before confirming save |
| BUG-012 | Medium | `updateOrderStatus` no enum validation; catch redirects instead of JSON |
| BUG-013 | Low | Orphaned `hh.js` file in `controllers/user/` |
| BUG-014 | Low | `generate` imported from Mongoose internals — unused, fragile |
| BUG-015 | Low | `session` imported from `express-session` in `profileController.js` — unused |

> **Note:** BUG-015 replaces the original BUG-015 (`find` from `addressSchema`) which was removed in Batch 2B along with BUG-004. The `find` import line was deleted. The remaining unused import in `profileController.js` is `session` from `express-session` (line 13).

---

---

## BATCH 3A — Safe fixes (implement immediately)

### BUG-009 — Shop default sort typo: `createOn` instead of `createdAt`

**Severity:** Medium  
**File:** `controllers/user/userController.js`, function `loadShoppingPage`

**Exact reproduction path:**
1. Navigate to `/shop` without any query parameters (no `sort` param in URL)
2. Products load in arbitrary insertion order (natural MongoDB order) instead of newest-first
3. Adding a new product does not place it at the top of the listing

**Root cause:**
```js
let sortOption = { createOn: -1 };  // line ~403
```
The Product schema uses `timestamps: true` which creates `createdAt` (Mongoose standard). The field `createOn` does not exist on any Product document. MongoDB silently ignores sort keys that don't match any document field and returns documents in natural (heap) order. The explicit sort options (`priceLowHigh`, `priceHighLow`, `nameAZ`, `nameZA`) are all correct — only the default is broken.

**Guaranteed or potential:** Guaranteed. Any user visiting `/shop` without an explicit sort selection sees unsorted results.

**Risk if modified:** Minimal. Single character change to one variable initialisation. The explicit sort branches are unchanged. No other code reads `sortOption` outside this function.

**Recommended fix:**
```diff
- let sortOption = { createOn: -1 };
+ let sortOption = { createdAt: -1 };
```

---

### BUG-012 — `updateOrderStatus` in admin: no enum validation; catch block returns HTML redirect for a JSON endpoint

**Severity:** Medium  
**File:** `controllers/admin/orderController.js`, function `updateOrderStatus`

**Exact reproduction path:**
1. Any Mongoose validation error during `order.save()` (e.g., an invalid status string sent via the API, or a DB write error)
2. The catch block executes `return res.redirect('/admin/pageError')` — an HTML 302 redirect
3. The AJAX handler on the admin frontend receives a redirect instead of JSON — it cannot parse the response and silently fails or throws a JS error
4. The UI gives no feedback; the status appears unchanged

Separate issue within the same function: no validation of the `status` value before writing it to the order. Any arbitrary string can be written directly to `order.status`. If that string is not in the schema enum, `order.save()` throws a Mongoose `ValidationError` — which triggers the broken catch above.

**Root cause:**
```js
const updateStatus = order.status = status;  // no enum check before assignment
// ...
} catch (error) {
    console.error('Error in update status', error);
    return res.redirect('/admin/pageError');   // HTML redirect for an AJAX endpoint
}
```

**Guaranteed or potential:** 
- Catch block returning HTML instead of JSON: **Guaranteed** whenever any error occurs in this handler (validation error, DB error, etc.)
- Invalid status string bypass: **Potential** (only triggered by a crafted request or UI bug; the admin UI presumably sends valid values)

**Risk if modified:** Low. Changes are contained to one function: add an enum guard at the top, change `res.redirect` to `res.status(500).json(...)` in the catch. No other function calls `updateOrderStatus`. The happy path (valid status) is unaffected.

**Recommended fix:**
```js
// Add before the order.status assignment:
const VALID_STATUSES = ['Pending','Processing','Shipped','Delivered','Cancelled','Return Request','Returned','Payment Failed'];
if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
}

// Change catch block:
} catch (error) {
    console.error('Error in update status', error);
    return res.status(500).json({ success: false, message: 'Failed to update order status' });
}
```

---

### BUG-013 — Orphaned `hh.js` file in `controllers/user/`

**Severity:** Low  
**File:** `controllers/user/hh.js`

**Exact reproduction path:**
Not a runtime bug — no reproduction path needed. The file exists on disk but is never imported by any route, controller, or module in the project.

**Root cause:** Leftover scratch/test file from development. Verified by grep: zero `require` statements reference `hh.js` anywhere in the codebase.

**Guaranteed or potential:** Guaranteed dead file. No functional impact.

**Risk if modified:** Zero. Deleting a file that nothing imports has no effect on runtime behaviour. Only risk is if a developer had placed important utility code there, which is unlikely given the name.

**Recommended fix:** Delete `controllers/user/hh.js`.

---

## BATCH 3B — Verify before fixing

### BUG-010 — `deleteSingleImage` builds wrong file path; file not deleted from disk

**Severity:** Medium  
**File:** `controllers/admin/productController.js`, function `deleteSingleImage`

**Exact reproduction path:**
1. In the admin panel, open Edit Product for any product with multiple images
2. Click the delete button on one image
3. The DB record is removed (product's `productImage` array is updated)
4. The physical file at `public/uploads/product-images/filename.png` is **not deleted**
5. The disk accumulates orphaned image files indefinitely
6. No error is shown to the admin — failure is swallowed

**Root cause:**
```js
// __dirname = controllers/admin/
const imagePath = path.join(__dirname, '..', 'public', 'uploads', 'product-images', path.basename(imageNameToServer));
// Resolves to: <root>/controllers/public/uploads/product-images/filename.png
// Actual location: <root>/public/uploads/product-images/filename.png
```

`path.join(__dirname, '..')` goes up one level from `controllers/admin/` to `controllers/` — not to the project root. The correct traversal is `'..', '..'` (up to root) or `'../../public/...'`.

**Additional issue confirmed during investigation:** `deleteSingleImage` imports `fs` as `const fs = require('fs')` (callback-based), but calls `await fs.unlink(imagePath)`. The callback-based `fs.unlink` does not return a Promise — `await` on it resolves immediately with `undefined` regardless of success or failure, and the catch block never fires on a missing file. The `console.warn` in the catch is currently unreachable for path errors. This means the silent failure has two causes: wrong path **and** non-promise `fs.unlink`.

**Why this needs verification before fixing:** Two issues are intertwined (wrong path + wrong `fs` module). The safest fix uses `fs.promises.unlink` (or `require('fs').promises.unlink`) together with the corrected path. However, the rest of the file uses callback-based `fs.unlink` for temp cleanup — changing `deleteSingleImage` alone to promises is an isolated, non-breaking change, but it should be confirmed before touching the file given the existing mixed usage.

**Guaranteed or potential:** Guaranteed. Every single image deletion fails to remove the physical file.

**Risk if modified:** Low-Medium. Two one-line changes in one function. Must verify correct path resolution before applying. Must switch to promise-based unlink.

**Recommended fix:**
```diff
- const imagePath = path.join(__dirname, '..', 'public', 'uploads', 'product-images', path.basename(imageNameToServer));
+ const imagePath = path.join(__dirname, '../../public/uploads/product-images', path.basename(imageNameToServer));

  try {
-     await fs.unlink(imagePath);
+     await fs.promises.unlink(imagePath);
  } catch (err) {
      console.warn(`Image ${imageNameToServer} not found on disk:`, err.message);
  }
```

---

### BUG-011 — `paymentFailed` sets `orderSuccess` session flag before confirming order was saved

**Severity:** Medium  
**File:** `controllers/user/checkoutController.js`, function `paymentFailed`

**Exact reproduction path:**
1. User is at checkout, Razorpay popup opens
2. User's payment fails — frontend calls `POST /payment-failed`
3. `paymentFailed` saves `newOrder` and clears the cart
4. `req.session.orderSuccess = true` is set **after** both `newOrder.save()` and `cart.save()`
5. If either save throws (e.g., a DB write failure after `newOrder.save()` succeeds but before `cart.save()`), the catch block runs but `orderSuccess` has **not** been set yet

**Assessment after code re-read:**

The original smoke test report stated that `req.session.orderSuccess = true` was set **before** the saves. After reading the actual current code, the sequence is:
```js
await newOrder.save();      // 1
cart.items = [];
await cart.save();          // 2
req.session.orderSuccess = true;  // 3 — set AFTER both saves
return res.status(200).json({ success: true, orderId: newOrder.orderId });
```

**The flag is already set after the saves.** The smoke test report's description of this bug does not match the current code. The flag is set in the correct position.

**Guaranteed or potential:** **This bug as described is NOT present in the current code.** The session flag is set after the save, not before. No fix is needed.

**Verification step required before any action:** Confirm no other code path in `paymentFailed` sets `orderSuccess` early. The current reading shows only one assignment at line 686, after both save operations.

**Risk if modified:** N/A — recommend marking as **not applicable** after manual QA confirms the checkout→payment-failed flow works end-to-end.

---

## BATCH 3C — Optional improvements (non-breaking cleanup)

### BUG-014 — `generate` imported from Mongoose internals in `userController.js` and `profileController.js`

**Severity:** Low  
**Files:** 
- `controllers/user/userController.js` line 1: `const { generate } = require('mongoose/lib/types/objectid');`
- `controllers/user/profileController.js` line 14: `const { generate } = require('mongoose/lib/types/objectid');`

**Exact reproduction path:** None — no runtime effect. Dead import.

**Root cause:** `generate` is imported from a Mongoose internal path but never called anywhere in either file. Verified by grep: zero occurrences of `generate(` in the codebase. Importing from internal Mongoose paths (`mongoose/lib/types/objectid`) is fragile — it can silently break if Mongoose restructures internals in a minor or patch release.

**Guaranteed or potential:** No current runtime bug. Potential fragility if Mongoose is upgraded.

**Risk if modified:** Zero. Removing an unused import that resolves to `undefined` (or a function that's never called) has no runtime effect. The only theoretical risk is if `generate` is somehow relied upon as a truthy value check somewhere — confirmed it is not.

**Recommended fix:** Remove both import lines.

---

### BUG-015 — `session` imported from `express-session` in `profileController.js` — unused

**Severity:** Low  
**File:** `controllers/user/profileController.js` line 13: `const session = require('express-session');`

**Note:** This replaces the original BUG-015 (`find` from `addressSchema`) which was already removed in Batch 2B as part of the BUG-004 dead-import cleanup.

**Exact reproduction path:** None — no runtime effect.

**Root cause:** `express-session` is imported as `session` but the variable is never referenced anywhere in `profileController.js`. All session access is via `req.session` (Express's request object), which does not require a direct import of the `express-session` module in controller files. The middleware is registered once in `server.js`.

**Guaranteed or potential:** No runtime bug. Minor unnecessary dependency load.

**Risk if modified:** Zero. Removing an unused import that is never called has no effect.

**Recommended fix:** Remove line 13: `const session = require('express-session');`

---

---

## Recommended Implementation Order

| Order | Bug | Batch | Reason |
|-------|-----|-------|--------|
| 1 | BUG-009 | 3A | Single-character fix, zero risk, guaranteed user-facing improvement (correct shop sort) |
| 2 | BUG-012 | 3A | Two changes in one function, eliminates broken AJAX error handling in admin |
| 3 | BUG-013 | 3A | File deletion only — zero risk |
| 4 | BUG-010 | 3B | Two-line fix but needs dual verification (path + fs module) before touching |
| 5 | BUG-011 | 3B | Re-verify against current code — may be already resolved; confirm in manual QA before deciding |
| 6 | BUG-014 | 3C | Low-priority cleanup, safe at any time |
| 7 | BUG-015 | 3C | Low-priority cleanup, safe at any time |

---

## Summary

| Batch | Bugs | Action |
|-------|------|--------|
| **3A — Safe fixes** | BUG-009, BUG-012, BUG-013 | Implement directly — minimal risk, well-understood changes |
| **3B — Verify first** | BUG-010, BUG-011 | BUG-010 needs path + fs module dual fix confirmed; BUG-011 may already be resolved in current code |
| **3C — Optional** | BUG-014, BUG-015 | Dead import removal — safe anytime, lowest priority |
