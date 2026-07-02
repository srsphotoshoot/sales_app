# Smart Label Scanner — Full Knowledge Handover

> **Last updated:** May 2026  
> **Fixed by:** Claude (Sonnet 4.6)  
> **For:** Antigravity and any future AI agent working on this feature

---

## Objective

Automate product ingestion by scanning a physical sticker that has:
- A **QR code** (contains an 8-digit UID like `XX1234XX`)
- Printed text with **Name, Rate (4-digit), and Colors**

The user should be able to add a product to inventory by just pointing the camera at the sticker — no manual typing needed.

---

## The Correct Flow (After Fixes)

```
User taps "Start Scanning"
        ↓
QRScanner opens (html5-qrcode, rear camera)
        ↓
QR code detected → scanner STOPS immediately (hasScanned ref)
        ↓
Video frame snapshot captured (canvas → base64 DataURL)
        ↓
OCRScanner opens with snapshot as initialImage
        ↓
Tesseract.js auto-runs OCR on the snapshot
        ↓
parseProductLabel() extracts: id, name, compulsoryData, rate, colors
        ↓
User reviews auto-filled fields, can tap lines to correct manually
        ↓
"Save Details" → handleOCRExtract() called
        ↓
NewProductRegistry opens with pre-filled form (QR key + OCR data)
        ↓
"Register Product" → registerProduct() API call
        ↓
Product saved → QR scanner reopens automatically for next product
```

---

## Components Involved

### 1. `QRScanner.jsx`
- Uses `html5-qrcode` library to scan via device camera
- On success callback: takes a canvas snapshot of the current video frame
- **CRITICAL**: Has a `hasScanned = useRef(false)` guard — once a QR is detected, it sets `hasScanned.current = true` and calls `html5QrCode.stop()` immediately. This prevents the callback from firing multiple times while React state updates are pending.
- The overlay frame (corner brackets) is OUTSIDE `#qr-reader` div — `html5-qrcode` clears its container's innerHTML on init, so overlays inside would be destroyed.
- Calls `onScan(decodedText, getSnapshot)` — passes both the QR text and an async snapshot function.

### 2. `FastProductCreator.jsx`
- Manages the entire flow via `activeScanner` state: `null` → `'qr'` → `'product-ocr'` → `null`
- **CRITICAL STATE SEPARATION**:
  - `pendingSnapshot` — holds the base64 image captured from QR scanner. Passed to OCRScanner as `initialImage`. Cleared after OCR completes.
  - `registrationData` — holds the final OCR-extracted product data. Set ONLY inside `handleOCRExtract()`. This is what triggers `NewProductRegistry` to render.
  - `smartRegKey` — the decoded QR string (the product UID). Attached to `registrationData` when OCR confirms.
- **CRITICAL**: `isProcessing = useRef(false)` — set to `true` at start of `handleQRScan`, reset to `false` in `handleSaveSuccess` and on cancel. Prevents double-scan race conditions.
- After save → `isProcessing.current = false` + `setActiveScanner('qr')` — loop continues for next product.

### 3. `OCRScanner.jsx`
- `mode` prop: `'product'` for sticker scan, `'customer'` for visiting card scan.
- When `initialImage` is passed (from QR snapshot), `useEffect` auto-triggers `handleExtract(null, initialImage)` — no manual camera tap needed.
- Has a 1200ms `canCapture` delay to allow previous camera resources to release before the manual capture buttons appear. This delay does NOT affect auto-OCR from `initialImage`.
- OCR engine: **Tesseract.js** (primary). Falls back to `@capacitor-community/image-to-text` native plugin only if Tesseract fails on a native device.
- After OCR: calls `parseProductLabel(lines)` to extract structured data.
- User can then manually tap any extracted text line to assign it to a field (interactive correction).

### 4. `NewProductRegistry.jsx`
- Simple confirmation form. Pre-filled from `initialData` (OCR output + qrKey).
- Rate priority: OCR rate → QR UID substring(2,6) → default 1.0
- Calls `registerProduct(productToSave)` API. On success, calls `onSave(result.product)` which triggers the loop to continue.

---

## Parsing Logic (`parseProductLabel` in OCRScanner.jsx)

```
Input: array of OCR text lines

1. For each line (spaces removed, uppercased):
   - Match 8-digit number → compulsoryData (e.g. "12123400")
     → rate = compulsoryData.substring(2, 6)  ← "1234" = ₹1234
   - Match 4-6 digit number → id (if not same as compulsoryData)
   - Match any COLOR_LIST word → add to detectedColors[]

2. Fallback: if no id found but compulsoryData exists
   → id = compulsoryData.substring(0, 4)

Output: { id, name, compulsoryData, rate, colors[] }
```

**COLOR_LIST** (update this if adding new colors):
`PINK, FIROZI, GOLD, WHITE, BLACK, RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE, BROWN, GREY, NAVY, MEHNDI, PISTA, ONION, RANI, LAVENDER, MUSTARD, TEAL`

---

## Bugs Fixed (May 2026)

### Bug 1 — CRITICAL: NewProductRegistry opened before OCR ran
**Root cause:** `handleQRScan` was calling `setRegistrationData({ qrKey, tempSnapshot })`. Since `{registrationData && <NewProductRegistry />}` is always watching this state, NewProductRegistry (z-index 1100) rendered immediately on top of OCRScanner (z-index 1000), blocking OCR entirely.

**Fix:** Introduced `pendingSnapshot` as a separate state. `registrationData` is now set ONLY inside `handleOCRExtract()`, never in `handleQRScan`. The snapshot travels through `pendingSnapshot` → `OCRScanner initialImage` → OCR runs → `handleOCRExtract` → `registrationData` set → `NewProductRegistry` renders.

---

### Bug 2 — CRITICAL: QR scanner fired multiple times (no isProcessing guard)
**Root cause:** `html5-qrcode` calls the success callback on every detected frame. Without a guard, `handleQRScan` was called rapidly multiple times before React could re-render and unmount the QR scanner. This caused race conditions — multiple snapshots, multiple OCR sessions.

**Fix (two-layer):**
1. `QRScanner.jsx`: `hasScanned = useRef(false)` inside the success callback. First detection sets it to `true` and calls `html5QrCode.stop()`. All subsequent callbacks are no-ops.
2. `FastProductCreator.jsx`: `isProcessing = useRef(false)`. `handleQRScan` returns early if already processing. Reset only after save or cancel.

---

### Bug 3 — CRITICAL: `customer` and `setCustomer` not declared in OCRScanner
**Root cause:** `OCRScanner.jsx` used `customer` and `setCustomer` in `clearData()`, `handleLineClick()`, and JSX rendering for customer mode — but never declared them with `useState`. Product mode survived only because those branches are inside `mode === 'customer'` conditionals.

**Fix:** Added `const [customer, setCustomer] = useState({ name: '', gst: '', contact: '', address: '' })` to the component.

---

### Bug 4 — MODERATE: QR scanner didn't stop after detection
**Root cause:** Even after `onScan` was called, `html5QrCode` kept running until the component physically unmounted on the next React render cycle. This made Bug 2 worse.

**Fix:** Explicit `html5QrCode.stop()` call inside the success callback before calling `onScan`.

---

### Bug 5 — MODERATE: `handleFileChange` didn't set `capturedImage`
**Root cause:** `handleExtract(reader.result)` was called with the DataURL as the first arg (`imagePath`), skipping `previewUrl`. OCR worked but no image preview was shown.

**Fix:** `setCapturedImage(reader.result)` + `handleExtract(null, reader.result)` — preview and OCR both work now.

---

### Bug 6 — MINOR: `rate` not recalculated when user tapped `compulsoryData` line manually
**Root cause:** `handleLineClick` for `activeField === 'compulsoryData'` only set `product.compulsoryData` via generic `setProduct(prev => ({ ...prev, [activeField]: text }))`. Rate was never recomputed.

**Fix:** Special case for `compulsoryData` in `handleLineClick`:
```js
const cleanText = text.replace(/\s/g, '');
const newRate = cleanText.length === 8 ? cleanText.substring(2, 6) : product.rate;
setProduct(prev => ({ ...prev, compulsoryData: cleanText, rate: newRate }));
```

---

## Rules for Future AI Agents (DO NOT BREAK)

1. **Never set `registrationData` inside `handleQRScan`**. It must only be set in `handleOCRExtract`. Setting it earlier will cause `NewProductRegistry` to render on top of OCRScanner.

2. **Never remove `hasScanned` ref from QRScanner** or `isProcessing` ref from FastProductCreator. `html5-qrcode` fires repeatedly — these guards are essential.

3. **Never move the overlay frame inside `#qr-reader` div** in QRScanner. `html5-qrcode` destroys the innerHTML of its container on init.

4. **`pendingSnapshot` and `registrationData` are different things.** `pendingSnapshot` is a temporary base64 image for OCR input. `registrationData` is the confirmed structured product data after OCR.

5. **`isProcessing.current = false` must be called in three places:** `handleSaveSuccess`, OCRScanner `onClose`, and NewProductRegistry `onCancel`. Missing any one will permanently block the scanner.

6. **If adding new colors** to detect, update `COLOR_LIST` in `OCRScanner.jsx` only — the parsing logic reads from there.

---

## State Machine Summary

```
activeScanner | pendingSnapshot | registrationData | What's visible
──────────────┼─────────────────┼──────────────────┼──────────────────────
'qr'          | null            | null             | QRScanner
'product-ocr' | <base64>        | null             | OCRScanner (auto-OCR)
null          | null            | <data>           | NewProductRegistry
'qr'          | null            | null             | QRScanner (next product)
```
