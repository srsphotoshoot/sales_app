# Sales SRS

Internal sales/inventory app for staff — a Capacitor mobile app (Android/iOS, React frontend) backed by an Express/Node server that stores its data as local JSON files. Staff scan barcodes to sell/register products, browse a shared catalog, and an Admin manages users, branding, bulk uploads and stock. The app also syncs with two external systems: a **Central Data Hub (CDH)** for a shared product catalog and cross-project data warehousing, and a separate **CRM** for order mirroring.

This document maps every code path: what each file does, where data comes from, where it goes, and how the pieces fit together. It reflects the code as it currently stands, including known rough edges (see [Known issues](#known-issues--rough-edges) at the end).

---

## 1. High-level architecture

```
┌─────────────────────────┐         ┌───────────────────────────┐
│  Capacitor App (mobile) │  HTTPS  │   Express server (Node)   │
│  React UI (src/)        │◄───────►│   server/server.cjs       │
│  Native plugins:        │         │   Port 4000 (fly.io) /    │
│   Camera, Filesystem,   │         │   5001 (local default)    │
│   Preferences, Share,   │         └──────────┬────────────────┘
│   GoogleAuth, image-to- │                    │
│   text (OCR)            │        reads/writes JSON files under
└─────────────────────────┘        server/data/ (see §5)
                                               │
                    ┌──────────────────────────┼───────────────────────┐
                    │                          │                       │
                    ▼                          ▼                       ▼
         Google Drive (product        Central Data Hub (CDH)     Office CRM
         catalog images, via           — separate FastAPI          (separate
         service-account API)          project, port 8000          project,
                                        — see its own README)       port 8005)
```

- **Frontend**: React (Vite build) wrapped by Capacitor into an Android/iOS app. Talks to the backend over plain HTTP(S) `fetch` calls, using a JWT stored in `Preferences` (Capacitor's persistent key-value store) for auth.
- **Backend**: a single Express process (`server/server.cjs`) that mounts several route modules, all reading/writing flat JSON files under `server/data/` (no SQL database) protected by an in-process async mutex.
- **External systems**: the backend both **pulls from** and **pushes to** the Central Data Hub, and separately **pushes** order data to an unrelated CRM microservice. Product photos live in Google Drive, not on this server's disk.

---

## 2. Auth & login flow

### 2.1 Native Google Sign-In (current, primary path)

1. `LoginScreen.jsx` calls `GoogleAuth.initialize()` (from `@codetrix-studio/capacitor-google-auth`) on mount, configured via `capacitor.config.json`'s `plugins.GoogleAuth` block (`clientId`/`serverClientId` = a **Web-type** OAuth client, `scopes: profile, email, drive.readonly`).
2. Tapping "Sign in with Google" calls `GoogleAuth.signIn()` — this launches the **native** Android/iOS Google account picker (not a WebView popup — see the note below on why that distinction matters).
3. The plugin returns `{ authentication: { idToken, accessToken } }`. The app sends **`idToken`** to the backend (`googleLogin(idToken)` → `POST /api/auth/google`), and keeps the **`accessToken`** client-side for direct Google Drive API calls (see §6).
4. Backend (`server/routes/auth.cjs POST /google`):
   - Verifies the token against `https://oauth2.googleapis.com/tokeninfo?id_token=...`.
   - Checks `aud`/`azp` equals `process.env.GOOGLE_CLIENT_ID` (the same Web client ID).
   - Checks `email_verified === 'true'`.
   - Looks up the email (lowercased) in `server/data/users.json`.
     - Found + `isActive:false` → 403 "not authorized".
     - **Not found at all → auto-provisioned as a new `Staff` account** (only accounts explicitly added with role `Admin` get Admin — auto-provisioning always creates `Staff`).
   - Issues an 8-hour JWT `{email, name, role}` signed with `JWT_SECRET`.
   - 10 failed attempts from one IP → 5-minute lockout.
5. Frontend stores `{token, timestamp, role, staffName}` in `Preferences['auth_session']` and treats the session as valid for a **rolling 2-hour window** (`App.jsx checkSession` re-stamps the timestamp on every successful check, so an actively-used session never expires; an idle one does after 2h).

> **Why `id_token` and not `access_token`?** Native Android/iOS Google Sign-In mints the `accessToken` against the platform's own Android/iOS-type OAuth client (matched by app package name + signing certificate fingerprint registered in Google Cloud Console), so its audience never matches the backend's Web client ID. Only the **ID token** is guaranteed to carry the Web client ID as its audience, because that's explicitly what was requested via `serverClientId`/`clientId` at sign-in time. Sending `access_token` to `/api/auth/google` (as an older web-only flow did) fails with "Token was not issued for this app" once the app runs natively.

> **Why not the old web `google.accounts.oauth2` JS SDK?** Google's Identity Services JS SDK silently refuses to initialize inside an embedded WebView (which is exactly what a Capacitor app's UI runs in) — this is a deliberate Google security policy (embedded WebViews can't be trusted not to phish credentials), not a bug in this app's config. The symptom was `"Google Sign-In is not configured"` with no console error, because `window.google.accounts.oauth2` simply never gets defined. The fix was switching to `@codetrix-studio/capacitor-google-auth`, which drives the **native** platform Sign-In SDK instead of a webview script tag.

> **Google Cloud Console requirement**: for native sign-in to succeed at all, an **Android-type OAuth client** (package name `com.salessrs.app` + the signing certificate's SHA-1 fingerprint) must be registered in the *same* Google Cloud project as the Web client ID used above — Google Play Services checks this pairing before it will issue any token. Without it, the native sign-in flow fails with a generic "Something went wrong" right after account selection.

### 2.2 Legacy / fallback login paths (`ENABLE_LEGACY_PIN`)

Only active if `.env`'s `ENABLE_LEGACY_PIN === 'true'` (otherwise both return `410 Gone`):
- `POST /api/auth/verify-staff` — shared per-staff code login (`server/data/staff.json`), 10 attempts/5min lockout.
- `POST /api/auth/verify-pin` — single shared Admin PIN (`ADMIN_MASTER_PIN` env var), 3 attempts/15min lockout.

### 2.3 One-time Guest key

`POST /api/auth/verify-key` — a 6-digit one-time code (generated by an Admin via `POST /api/admin/generate-key`, stored in `keys.json`) issues an 8h Guest-role JWT. Used for temporary/visitor access without a Google account.

---

## 3. Server routes — full reference

All routes are mounted in `server/server.cjs`. Auth middleware (`server/middleware/auth.cjs`): `checkAuth` requires `Authorization: Bearer <jwt>` and sets `req.user` to the **role string** (`Admin|Staff|Guest`); `isAdmin` additionally requires `req.user === 'Admin'`.

### `/api/auth` (`server/routes/auth.cjs`) — see §2 above

### `/api/admin` (`server/routes/admin.cjs`)
| Method & path | Auth | What it does |
|---|---|---|
| `POST /generate-key` | Admin | Random 6-digit code → `keys.json` |
| `GET /active-keys` | Admin | Unused (not-yet-redeemed) keys |
| `GET /users` | any authenticated | Full `users.json` |
| `POST /users/add` | Admin | Adds a user (`name/email/role`), rejects duplicate email, pushes to CDH Hub, then best-effort shares the Google Drive catalog folder with the new user's email (Drive sends its own "shared with you" notification — no custom email code) |
| `POST /users/toggle` | Admin | Flips a user's `isActive` |
| `DELETE /users/:id` | Admin | Removes a user, pushes delete to Hub |
| `GET /branding` | **none (public)** | `{logoUrl, logoPosition}` — needed pre-login for the branding shown behind the login screen |
| `POST /branding/update` | Admin | Overwrites `branding.json`, pushes to Hub |
| `POST /logo/upload` | Admin (multipart) | Saves to `server/data/uploads/logo/logo.png` (always overwrites same filename), pushes to Hub |

### `/api/products` (`server/routes/products.cjs`)
| Method & path | Auth | What it does |
|---|---|---|
| `GET /?q=` | any | Main product feed; optional multi-term AND search across `uid, id, name, color, category, barcodes` |
| `POST /save-product` | any | Registers a new product (rejects duplicate `uid`), logs an `ADD` inventory action, pushes to Hub |
| `POST /link-barcode` | any | Appends a scanned barcode to a product's `barcodes[]` if not already linked (no Hub push) — this is how a physical barcode gets permanently associated with a product after its first successful scan-match |
| `POST /update` | any | Patches a product by `uid` (barcodes are admin-only, stripped from this payload); logs `UPDATE` only if stock (`pcs`) changed; pushes to Hub |
| `POST /bulk-images` | Admin (multipart `images[]`) | Matches uploaded filenames to products (leading digits, or name/uid substring), uploads matched buffers to Google Drive, sets `imageUrl = "drive:<fileId>"` |
| `POST /upload-image` | Admin (multipart `image`) | Uploads one image to Drive, returns `{url:"drive:<fileId>"}` |
| `GET /variants/:id` | any | All color-variant product records sharing one base `id` |
| `POST /variants/save` | Admin | Bulk upsert/delete of color variants for one base `id` (new variants get synthetic `uid`s) |
| `POST /sync` | Admin | Pulls all `products` from CDH (`fetchFromHub`), merges with local: any local product not present on the Hub is kept (registered locally via Fast Product Creator), Hub data wins for shared `uid`s |
| `DELETE /:uid` | Admin | Removes a product, logs `DELETE`, pushes delete to Hub |

### `/api/sales` (`server/routes/sales.cjs`)
| Method & path | Auth | What it does |
|---|---|---|
| `POST /save-order` | Staff/Admin | Validates cart/customer, checks stock isn't oversold, **writes the order to `sales_history.json` before decrementing stock** (so an order is never lost if the stock write fails), logs one `SALE` inventory action per cart line, then fire-and-forgets a push to both the CDH Hub and the separate CRM |
| `GET /history` | any | Full `sales_history.json` |
| `GET /customers/search?q=` | any | Scans past orders for matching customer name/contact/address (autocomplete for repeat customers) |
| `DELETE /order/:orderId` | Admin | Removes an order (does **not** restore the stock it had decremented — see [Known issues](#known-issues--rough-edges)) |

### `/api/inventory` (`server/routes/inventory.cjs`)
| Method & path | Auth | What it does |
|---|---|---|
| `POST /bulk-upload` | Admin | Upserts an Excel-sheet-derived product list by `uid`, logs one `BULK` action, pushes every row to Hub individually |
| `GET /logs` | any | `inventory_logs.json` (capped at the most recent 1000 entries) |

### `/api/catalog` (`server/routes/catalog.cjs`) — proxy to CDH's separate catalog
| Method & path | Auth | What it does |
|---|---|---|
| `GET /image/:fileId` | **none (public)** | Streams/proxies an image straight from CDH (`${CDH_BASE}/api/v1/catalog/image/:fileId`), 24h browser cache header |
| `GET /lookup/:id` | any | Looks up one product from an **in-memory 1-hour cache** (no live CDH call on every lookup) |
| `GET /?refresh=1` | any | Fetches the full CDH catalog (with Drive image-file-ids per color variant), caches it for 1h |

### `/api/exhibition` (`server/routes/exhibition.cjs`)
Blocks `Guest` role entirely.
| Method & path | Auth | What it does |
|---|---|---|
| `GET /` | Staff/Admin | Full `exhibition.json` |
| `POST /` | Staff/Admin | Upserts items by `productCode` |
| `DELETE /` | Admin | Wipes `exhibition.json` |

### Misc top-level (`server/server.cjs`)
- `GET /api/health` — pings CDH's `/status` (2s timeout) and reports `{hubStatus: online|offline}`.
- Serves the built frontend (`dist/`) statically with an SPA fallback (any non-`/api` HTML GET → `index.html`).
- **CDH auto-sync background job**: 30s after boot, then every 30 minutes, POSTs the *entire* `products.json` as one batch to the CDH webhook (`X-Source: sales_app_products_bulk`) — a belt-and-braces full resync on top of the per-action pushes every route already does.

---

## 4. Shared server utilities

- **`utils/helpers.cjs`**: `safeReadJSON` (returns a default on missing/corrupt file, and backs up a corrupt file to `.bak-<timestamp>` before overwriting it — silent data-loss protection); `saveAtomic` (write-to-temp-then-rename, so a crash mid-write never corrupts the JSON file); `generateID(prefix)`; `getPublicUrl` (turns a relative `/uploads/...` path into an absolute URL using `VITE_API_URL`, needed because the external Hub can't resolve relative paths).
- **`utils/lock.cjs` / `utils/shared.cjs`**: a single process-wide `AsyncLock` (`globalLock`) that nearly every mutating route acquires before its read-modify-write JSON cycle, preventing two concurrent requests (e.g. two staff scanning at once) from racing and clobbering each other's writes. This only serializes within **one** Node process — it would not protect against running multiple server instances against the same data files.
- **`utils/logging.cjs`**: `logInventoryAction` — every `ADD/UPDATE/SALE/BULK/DELETE` appends one entry to `inventory_logs.json`, capped at the most recent 1000.
- **`utils/hub.cjs`** — the CDH integration (see §7).
- **`config/paths.cjs`** — single source of truth for every data file path (all under `server/data/`).
- **`config/multer.cjs`** — upload handling: `uploadLogo` (disk, fixed filename → always overwrites), `uploadProductsToMemory` (in-memory buffers handed straight to the Google Drive uploader). Restricted to jpeg/png/webp/gif, 15MB max.
- **`config/googleDrive.cjs`** — Google Drive v3 client via a service-account key. `shareDriveFolder(email)` grants read access to the shared catalog folder (cascades to every file inside, including future uploads — a one-time action per new user). `uploadImageToDrive` uploads a buffer and returns a Drive file ID, which gets stored on the product as `imageUrl = "drive:<fileId>"` and resolved client-side via `https://www.googleapis.com/drive/v3/files/<fileId>?alt=media` using the signed-in user's own OAuth Drive access token.

---

## 5. Data files (`server/data/*.json`)

No SQL database — every "table" is a flat JSON array (or object) file, read/written wholesale on each mutation (guarded by `globalLock` + atomic rename).

| File | Shape | Notes |
|---|---|---|
| `products.json` | array, `{uid, id, name, colors[], rate, pcs, color, ageDays, isClearance, isUrgent?, isBestSeller?, imageUrl?, images[]?, barcodes[]?, timestamp, source?}` | The core inventory table — everything else references it by `uid`/`id` |
| `sales_history.json` | array, `{orderId, timestamp, customer:{name,gst,contact,address,createdBy}, createdBy, cart[], totalItems, totalValue}` | Append-mostly order log |
| `users.json` | array, `{id, name, email, role, isActive, createdAt}` | Google-account login allowlist (see §2.1 for auto-provisioning behavior) |
| `keys.json` | array, `{key, createdAt, used, usedAt}` | One-time Guest login codes |
| `branding.json` | object, `{logoPosition}` | Logo shown pre-login |
| `exhibition.json` | array, `{productCode, name, colours[], rate, stock, uids[], catalogueMatched, images[], timestamp}` | Exhibition-mode item list |
| `inventory_logs.json` | array, `{id, timestamp, action, uid, name, prevQty, newQty, orderId?, user}` | Audit trail, capped at 1000 |
| `staff.json` | array, `{id, name, code, isActive, createdAt}` | Legacy staff-code records — only read if `ENABLE_LEGACY_PIN=true` |
| `central_hub_cache.json`, `sessions.json` | — | **Not read by any current route** — leftover artifacts from an earlier architecture; safe to ignore/clean up |

---

## 6. Native mobile capabilities (Capacitor plugins)

| Plugin | Used for |
|---|---|
| `@capacitor/camera` | Photo capture for OCR (visiting cards, product labels) in `OCRScanner.jsx` |
| `@capacitor/filesystem` | Temp OCR snapshots; on-device catalog image cache (WiFi-gated); writing Excel templates / shared images/PDFs before handing off to Share |
| `@capacitor/share` | Native share sheet for generated PDFs, branded promo images, Excel templates |
| `@capacitor/preferences` | Persistent key-value store: `auth_session`, `srs_hub_url_override`, cart/customer/offline-order drafts, image-cache toggle |
| `@codetrix-studio/capacitor-google-auth` | Login (§2.1) and Google Drive access-token refresh |
| `@capacitor-community/image-to-text` (`Ocr`) | **The actual OCR engine used at runtime** — see note below |
| `html5-qrcode` | Fallback barcode decode path only (see §8) — not the primary scanner |

> `tesseract.js` and `jsqr` are listed as npm dependencies but are **not imported anywhere** in the current code — leftovers from an earlier OCR/scanning architecture. `docs/SMART_SCAN_GUIDE.md` documents that older (Tesseract-based) flow and is stale; treat this README as current, not that doc.

---

## 7. Central Data Hub (CDH) integration

CDH is a separate FastAPI project (own repo/README) acting as a shared warehouse across multiple internal apps. This app talks to it via `server/utils/hub.cjs`:

- **Pull** — `fetchFromHub(category)`: `GET {CDH_API_URL}/data/{category}?limit=10000` with an `X-API-KEY` header. Only ever called for `category='products'`, only from the Admin-triggered `POST /api/products/sync` route — **there is no automatic scheduled pull**, an Admin must tap "Sync from Hub".
- **Push** — `pushToHub(source, data)`: fire-and-forget `POST {CDH_WEBHOOK_URL}` with an `X-Source` header identifying the payload type (`sales_app_products`, `sales_app_users`, `sales_app_branding`, `sales_app` for orders). Called from nearly every mutating route, plus the 30-minute full-batch resync job in `server.cjs`. On failure, logs to `server/data/sync_errors.log` rather than failing the original request.
- Image/logo URLs are rewritten to absolute URLs (`getPublicUrl`) before pushing, since CDH can't resolve this server's relative `/uploads/...` paths.
- Env vars: `CDH_API_URL` (pull base), `CDH_WEBHOOK_URL` (push target), `CDH_API_KEY` (auth for both).

Separately, `pushToCRM(orderData)` in the same file fires order data at a hardcoded `127.0.0.1:8005/api/v1/exhibition/ingest` — this is a completely unrelated "Office CRM" microservice (own repo), not part of CDH.

---

## 8. Barcode & OCR scanning pipeline

**Camera & decode** (`QRScanner.jsx`):
1. Opens the rear camera (`getUserMedia`, `facingMode: 'environment'`).
2. On "TAP TO SCAN", grabs the current video frame onto an offscreen `<canvas>`.
3. Decodes via the native `BarcodeDetector` browser API first (QR, Code128, EAN-13, Code39, UPC-A/E, DataMatrix, EAN-8 — fast, 4s timeout); falls back to `html5-qrcode`'s `scanFile()` on the captured JPEG only if `BarcodeDetector` is unavailable.
4. Returns the decoded string to whichever screen opened the scanner (`SalesSection`, `FastProductCreator`, or `ExhibitionSection` — each implements the same logic independently, not shared).

**Product matching** (in the calling component):
1. Search the already-loaded in-memory `products` array for `uid === scanned`, `id === scanned`, case-insensitive `name` match, or membership in any product's `barcodes[]`.
2. **Match found** → beep + torch flash, auto-link the scanned code to that product's `barcodes[]` (`POST /api/products/link-barcode`) if it wasn't already linked, then branch to "Add to Order" or "Update Product".
3. **No match** → OCR fallback: the frame captured in step 2 above is written to a temp file, and native `Ocr.detectText()` runs on it. All detected text lines are joined and searched for a **7-digit numeric token**: `id = token.substring(2, len-1)`, `rate = parseInt(token.substring(0,2) + '95')` (a fixed label-format assumption — first 2 digits + a hardcoded `"95"` suffix forms the rate, middle digits are the product ID). A shorter 4-6 digit token may also resolve directly to an existing `id`.
4. If the OCR'd `id` matches an existing product → same auto-link + action-sheet as step 2. If not → `fetchCatalogProductById` pre-fills available colors from the CDH catalog cache, and a "New Product" form opens pre-filled with the parsed id/rate/colors for the user to confirm and save (`POST /api/products/save-product`).
5. Total miss (no 7-digit token, no catalogue hit) → the new-product form opens empty except for the raw scanned code, for fully manual entry.

**Customer capture** (`OCRScanner.jsx`, separate from the above) uses the same native `Ocr.detectText()` but on a visiting-card photo, with regex-based name/GST/phone extraction and a "tap a detected line to assign it to a field" correction UI.

---

## 9. Deployment shapes

### Local development (this machine)
- Vite dev server (`npm run dev`, port 5173, HTTPS via `@vitejs/plugin-basic-ssl`) proxies `/api` and `/uploads` to the raw Express server (`npm run server`, nodemon, port 5001).
- For testing on a real device/emulator, the built app + Express server run together on port 4000 (PM2 process `sales-srs-backend`, `ecosystem.config.cjs`), fronted by a local **nginx** on port 8080 (path prefix `/sales/` → `localhost:4000`), fronted by a **Cloudflare Tunnel** (PM2 process `sales-srs-tunnel`) for a public HTTPS URL the mobile app can reach. `update-url.sh` automates: read the current tunnel URL from PM2 logs → rewrite `VITE_API_URL` in `.env` → rebuild the Vite frontend → `npx cap sync android` → rebuild the debug APK.
- Because Capacitor's WebView loads the app from `https://localhost`, any **plain `http://`** API URL gets blocked as mixed content — the tunnel (HTTPS) or an Android-emulator-only `http://10.0.2.2:<port>` loopback are the two ways around this for local testing.

### Production (fly.io)
- `Dockerfile`: two-stage build. Stage 1 bakes `VITE_API_URL`/`VITE_GOOGLE_CLIENT_ID` into the frontend bundle at **build time** (Vite inlines `VITE_`-prefixed vars — they cannot change at container runtime without a rebuild). Stage 2 runs only `node server/server.cjs`, serving both the API and the static build — no separate nginx/tunnel needed, Fly's own edge handles TLS.
- `fly.toml`: app `sales-srs`, region `bom` (Mumbai), port 4000, a persistent volume mounted at `/app/server/data` so the JSON data files and uploads survive redeploys.

### Environment variables (`.env`)
| Var | Used for |
|---|---|
| `VITE_API_URL` | Frontend's fallback API base; also used server-side to build absolute image URLs for Hub pushes |
| `JWT_SECRET` | Signs/verifies all app session JWTs |
| `GOOGLE_CLIENT_ID` | Server-side check that a Google token was issued for this app |
| `VITE_GOOGLE_CLIENT_ID` | Baked into the frontend build (actual native-plugin client ID is configured in `capacitor.config.json`) |
| `SALES_APP_DRIVE_FOLDER_ID` | The shared Google Drive catalog-images folder |
| `ENABLE_LEGACY_PIN` | Gates the old PIN/staff-code login routes |
| `CDH_API_URL` / `CDH_WEBHOOK_URL` / `CDH_API_KEY` | Central Data Hub pull/push (§7) |
| `CRM_API_KEY` | Auth header for the separate Office CRM push |
| `ADMIN_MASTER_PIN` | Legacy shared Admin PIN (only relevant if `ENABLE_LEGACY_PIN=true`) |
| `PORT` | Server listen port (4000 in production; 5001 local default) |

---

## 10. Known issues / rough edges

- Deleting an order (`DELETE /api/sales/order/:orderId`) does **not** restore the product stock that order had decremented.
- `central_hub_cache.json` and `sessions.json` in `server/data/` are unused leftovers from an earlier architecture.
- `tesseract.js` and `jsqr` are unused npm dependencies; the real OCR/decode engines are the native `Ocr` plugin and the browser `BarcodeDetector` API respectively.
- `docs/SMART_SCAN_GUIDE.md` describes an older scanning architecture and does not reflect the current code — this README's §8 is the current source of truth.
- Barcode/OCR product-matching logic is duplicated (not shared) across `SalesSection.jsx`, `FastProductCreator.jsx`, and `ExhibitionSection.jsx` — a bug fix in one place needs to be mirrored in the other two.
- `globalLock` only serializes writes within a single Node process; it would not prevent races if the server were ever scaled to multiple instances against the same JSON files.
