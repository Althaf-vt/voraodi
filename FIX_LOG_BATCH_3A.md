# FIX LOG — Batch 3A (Medium/Low Bugs: Sort Typo, Order Status, Dead File)

> Applied: 2025-06  
> Scope: BUG-009, BUG-012, BUG-013 from SMOKE_TEST_REPORT.md  
> Files modified: 2  
> Files deleted: 1  
> Files created: 1 (this log)

---

## BUG-009 — Shop default sort typo: `createOn` instead of `createdAt`

**Severity:** Medium  
**File:** `controllers/user/userController.js`, function `loadShoppingPage`

### Why it happened

The default sort for the shop page was initialised with a non-existent field name:

```js
let sortOption = { createOn: -1 };
```

The Product Mongoose schema uses `timestamps: true`, which creates `createdAt` (not `createOn`). MongoDB silently ignores sort keys that match no field, so products were returned in natural heap order instead of newest-first whenever no explicit sort was selected.

### Exact code change

```diff
- let sortOption = { createOn: -1 };
+ let sortOption = { createdAt: -1 };
```

**Line changed:** `loadShoppingPage`, sort initialisation block.

### How the fix solves it

`createdAt` is the field Mongoose actually writes. The default sort now correctly orders products newest-first when no sort query parameter is present.

### Possible side effects

None. The four explicit sort branches (`priceLowHigh`, `priceHighLow`, `nameAZ`, `nameZA`) are unchanged and unaffected. This change only corrects the fallback value used when `sort` is absent from the query string.

---

## BUG-012 — `updateOrderStatus`: no enum validation; catch block returns HTML redirect for a JSON endpoint

**Severity:** Medium  
**File:** `controllers/admin/orderController.js`, function `updateOrderStatus`

### Why it happened

**Issue 1 — No enum validation:**  
Any `status` string from `req.body` was written directly to `order.status` without being checked against the schema enum. An invalid value caused `order.save()` to throw a Mongoose `ValidationError`.

**Issue 2 — HTML redirect in catch:**  
The catch block called `return res.redirect('/admin/pageError')`, which sends an HTTP 302 HTML redirect. The admin frontend calls this endpoint via AJAX and expects JSON. A redirect response cannot be parsed as JSON, causing the AJAX handler to fail silently with no user feedback.

```js
// BEFORE — no guard, catch returns HTML:
const updateStatus = order.status = status;  // no validation
// ...
} catch (error) {
    console.error('Error in update status', error);
    return res.redirect('/admin/pageError');  // breaks AJAX
}
```

### Exact code change

```diff
  const updateOrderStatus = async (req, res) => {
      try {
          const { orderId, status } = req.body;

+         const VALID_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Payment Failed'];
+         if (!VALID_STATUSES.includes(status)) {
+             return res.status(400).json({ success: false, message: 'Invalid status value' });
+         }
+
          const order = await Order.findOne({ orderId });
          // ... rest of function unchanged ...

      } catch (error) {
          console.error('Error in update status', error);
-         return res.redirect('/admin/pageError');
+         return res.status(500).json({ success: false, message: 'Failed to update order status' });
      }
  }
```

### How the fix solves it

- The enum guard runs before any DB operation. Invalid status values are rejected immediately with a 400 JSON response, preventing a Mongoose `ValidationError` from ever being thrown.
- The catch block now returns a 500 JSON response, which the admin AJAX handler can parse and display to the user rather than failing silently.
- Valid status updates follow the exact same code path as before — no logic change for the happy path.

### Possible side effects

None. The enum values in `VALID_STATUSES` exactly mirror those declared in `orderSchema.js` item status enum plus the order-level status enum. All existing admin UI flows that send valid status strings are unaffected. No other function calls `updateOrderStatus`.

---

## BUG-013 — Orphaned `hh.js` file in `controllers/user/`

**Severity:** Low  
**File:** `controllers/user/hh.js` — **deleted**

### Why it happened

A file named `hh.js` existed in `controllers/user/` but was never imported by any route, controller, service, or utility in the project. It was a leftover scratch/test file from development.

### Action taken

File deleted:
```
controllers/user/hh.js  →  (removed)
```

### How the fix solves it

No orphaned file on disk. No accidental future imports. No confusion for developers navigating the controllers directory.

### Possible side effects

None. Confirmed by grep before deletion: zero `require` statements in the entire codebase referenced `hh.js`.

---

## Summary

| Bug | File | Change |
|-----|------|--------|
| BUG-009 | `controllers/user/userController.js` | `createOn` → `createdAt` in default `sortOption` |
| BUG-012 | `controllers/admin/orderController.js` | Added `VALID_STATUSES` enum guard; replaced `res.redirect` with `res.status(500).json` in catch |
| BUG-013 | `controllers/user/hh.js` | File deleted |

No payment flows, authentication, or architecture was touched.

---

*Awaiting approval before proceeding to Batch 3B.*
