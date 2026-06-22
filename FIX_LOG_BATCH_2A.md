# FIX LOG — Batch 2A (High Bugs: Cart / Wishlist / Address)

> Applied: 2025-06  
> Scope: BUG-006, BUG-007, BUG-008 from SMOKE_TEST_REPORT.md  
> Files modified: 2  
> Files created: 1 (this log)

---

## BUG-006 — Cart quantity can be decremented to zero

**Severity:** High  
**File:** `controllers/user/profileController.js`, function `updateQty`

### Why it happened

The `decrease` branch of `updateQty` subtracted 1 from `item.quantity` with no lower-bound check:

```js
} else if (action === 'decrease') {
    item.quantity -= 1;

    //Remove if quantity is 0
    // if(item.quantity <= 0){
    //     userCart.items.splice(itemIndex,1);
    // }
}
```

The removal guard had been commented out at some point during development and never restored. As a result, a cart item with `quantity: 1` could be decremented to `quantity: 0`, saved to the database, and would reappear at checkout with `totalPrice: 0`, producing a corrupt cart state.

### Exact code change

```diff
  } else if (action === 'decrease') {
      item.quantity -= 1;

-     //Remove if quantity is 0
-     // if(item.quantity <= 0){
-     //     userCart.items.splice(itemIndex,1);
-     // }
+     if (item.quantity <= 0) {
+         userCart.items.splice(itemIndex, 1);
+         await userCart.save();
+         return res.status(200).json({ success: true, removed: true, message: 'Item removed from cart' });
+     }
  }
```

### How the fix solves it

When quantity after decrement is ≤ 0, the item is immediately removed from the array, the cart is saved, and a `{ removed: true }` response is returned. The item never reaches the database with a zero or negative quantity. The frontend can use the `removed: true` flag to remove the row from the UI.

### Possible side effects

- The `increase` max-3 guard and `item.quantity > 3` check after the if-block are untouched — maximum enforcement is unchanged.
- The `totalPrice` recalculation block (`if (item.quantity > 0) { item.totalPrice = ... }`) is only reached when the item is not removed, so it remains correct.
- The dedicated `removeItem` endpoint (`POST /cart/remove-item`) is unaffected.

---

## BUG-007 — Wishlist `removeItem` matches by subdocument `_id` instead of `productId`

**Severity:** High  
**File:** `controllers/user/wishlistController.js`, function `removeItem`

### Why it happened

The wishlist schema stores products as an array of subdocuments:
```js
{ productId: ObjectId, addedOn: Date }
```
Mongoose automatically assigns each subdocument its own `_id`. The frontend sends the product's own `ObjectId` as `productId` in the request body. However, `removeItem` matched using the subdocument's auto-generated `_id`:

```js
const itemIndex = wishlist.products.findIndex((product => product._id.equals(productId)));
```

`product._id` is the subdocument's internal Mongoose id — completely different from `product.productId` which holds the actual product reference. The `findIndex` therefore always returned `-1`, and every removal attempt returned `400 Product not found in wishlist`.

### Exact code change

```diff
- const itemIndex = wishlist.products.findIndex((product => product._id.equals(productId)));
+ const itemIndex = wishlist.products.findIndex((item) => item.productId.equals(productId));
```

### How the fix solves it

The lookup now compares against `item.productId` — the stored product reference — which is exactly what the frontend sends. The `findIndex` returns the correct index, `splice` removes the entry, and the 200 success response is returned.

### Possible side effects

- The `addToCart` function in the same file uses `$pull` with `productId` (correct) and is unchanged.
- The `loadWishlist` function populates `products.productId` — this field name is preserved by the fix.
- No other wishlist functions are affected.

---

## BUG-008 — `getEditAddress` catch block references undefined variable `err`

**Severity:** High  
**File:** `controllers/user/profileController.js`, function `getEditAddress`

### Why it happened

The catch clause captures the thrown value as `error`, but the `console.error` call referenced `err` — a variable that does not exist in this scope:

```js
} catch (error) {
    console.error('GET /address error:', err);   // 'err' is undefined
    res.status(500).json({ success: false, message: messages.SERVER_ERROR });
}
```

When any database error occurred inside `getEditAddress` (e.g., a MongoDB timeout), Node.js first ran the catch block, hit the undefined `err` reference, and threw a secondary `ReferenceError: err is not defined`. The 500 JSON response was still sent (since it came after the `console.error` call), but the original error was swallowed without being logged, making debugging impossible.

### Exact code change

```diff
  } catch (error) {
-     console.error('GET /address error:', err);
+     console.error('GET /address error:', error);
      res.status(500).json({ success: false, message: messages.SERVER_ERROR });
  }
```

### How the fix solves it

The caught variable `error` is now correctly passed to `console.error`. The original error is logged to the process console and the 500 JSON response is returned cleanly without a secondary `ReferenceError` polluting the error stream.

### Possible side effects

None. This is a single character change in an error logging call. The HTTP response behaviour (status 500, same JSON body) is identical. No other function or middleware is affected.

---

## Summary

| Bug | File | Change |
|-----|------|--------|
| BUG-006 | `controllers/user/profileController.js` | Restored removal guard in `updateQty` decrease branch |
| BUG-007 | `controllers/user/wishlistController.js` | Fixed `removeItem` to match `item.productId` instead of `item._id` |
| BUG-008 | `controllers/user/profileController.js` | Fixed catch block in `getEditAddress` to log `error` not `err` |

No authentication, payment, or architecture code was touched.

---

*Awaiting approval before proceeding to Batch 2B.*
