# FIX LOG — Batch 3B (BUG-010: Product Image Delete)

> Applied: 2025-06  
> Scope: BUG-010 from SMOKE_TEST_REPORT.md  
> Files modified: 1  
> Files created: 1 (this log)

---

## BUG-010 — `deleteSingleImage` builds wrong path and uses non-Promise `fs.unlink`

**Severity:** Medium  
**File:** `controllers/admin/productController.js`, function `deleteSingleImage`

### Why it happened

Two separate issues combined to make every single image deletion silently fail to remove the file from disk. The DB record was updated correctly, but the physical file remained.

---

#### Issue 1 — Wrong file path

```js
// BEFORE:
const imagePath = path.join(__dirname, '..', 'public', 'uploads', 'product-images', path.basename(imageNameToServer));
```

`__dirname` inside `controllers/admin/productController.js` resolves to `<project-root>/controllers/admin/`.

`path.join(__dirname, '..')` goes up **one** level to `<project-root>/controllers/` — not to the project root.

The resulting path was:
```
<project-root>/controllers/public/uploads/product-images/filename.png
```

The actual file location is:
```
<project-root>/public/uploads/product-images/filename.png
```

The path was wrong by one directory level. `fs.unlink` (or `fs.promises.unlink`) on a non-existent path throws an `ENOENT` error.

---

#### Issue 2 — `await` on callback-based `fs.unlink`

The file imports `fs` as:
```js
const fs = require('fs');  // callback-based module
```

`deleteSingleImage` then calls:
```js
await fs.unlink(imagePath);
```

`fs.unlink` from the callback-based `fs` module does **not** return a Promise — it accepts a callback and returns `undefined`. `await undefined` resolves immediately to `undefined` without error, regardless of whether the file deletion succeeded or failed. The `catch` block was therefore **unreachable** for any error thrown by the unlink operation itself.

The net result: even if the path had been correct, the error from a failed unlink would never have been caught and logged.

---

### Exact code change

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

**Lines changed:** 380–382 in `controllers/admin/productController.js`.

---

### How the fix solves it

**Path fix:** `path.join(__dirname, '../../public/uploads/product-images', ...)` traverses up two levels from `controllers/admin/` to the project root, then descends into `public/uploads/product-images/`. This matches the actual storage location.

**Promise fix:** `fs.promises.unlink` returns a real Promise. `await` now correctly waits for the OS file deletion to complete. If the file does not exist (`ENOENT`), the error is caught by the inner `try/catch` and logged as a `console.warn` — same behaviour as before, but now actually reachable. Any other disk error is also caught and logged.

---

### Possible side effects

- **Other `fs.unlink` calls in the same file are unchanged.** Lines 49 and 317 use callback-based `fs.unlink` for temp file cleanup during image uploads — these are fire-and-forget patterns with their own callback error handlers and do not need to be Promises. They are not affected.
- **`fs` import unchanged.** `const fs = require('fs')` remains. `fs.promises` is a sub-namespace of the same `fs` module — no additional import is needed.
- **DB update logic unchanged.** `Product.findByIdAndUpdate` with `$pull` runs before the file deletion. If the DB update succeeds but the file is not found on disk, the `console.warn` fires and the JSON success response is still returned to the client — same as the original intent.

---

## Summary

| Bug | File | Changes |
|-----|------|---------|
| BUG-010 | `controllers/admin/productController.js` | Fixed path: `'..', 'public'` → `'../../public/uploads/product-images'`; Fixed unlink: `fs.unlink` → `fs.promises.unlink` |

No payment, authentication, session, or upload architecture was touched.

---

*Awaiting approval before proceeding to Batch 3C.*
