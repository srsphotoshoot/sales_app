#!/usr/bin/env node
/**
 * Import barcode report Excel files into the app's products.json database.
 *
 * Usage:
 *   node scripts/import-barcode-report.cjs --file "path/to/file.xlsx" --source srs
 *   node scripts/import-barcode-report.cjs --file "path/to/file.xls"  --source radhika
 *
 * Column mapping from the barcode report:
 *   col[1]  Commonbarcode Id  → barcodes[0]  (13-digit scannable barcode)
 *   col[4]  Takabarcode No    → barcodes[1]  (11-digit taka barcode)
 *   col[8]  Item Name         → id + name    (design code, e.g. "2316", "SC11469")
 *   col[10] Color Name        → color
 *   col[18] Balance Pcs       → pcs
 *   col[24] Rate              → rate
 *
 * IMPORTANT: Both SRS and Radhika use the SAME barcode number-space independently.
 * The same 13-digit barcode maps to completely different products in each shop.
 * uid is therefore prefixed: "srs_XXXXXX" or "rad_XXXXXX" to avoid collision.
 * The raw barcodes in barcodes[] stay unprefixed (they're on the physical sticker).
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, '../server/data/products.json');
const TEMP_FILE     = PRODUCTS_FILE + '.tmp';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
};
const filePath = getArg('--file');
const source   = getArg('--source') || 'unknown';

if (!filePath) {
    console.error('Usage: node import-barcode-report.cjs --file <path> --source <srs|radhika>');
    process.exit(1);
}
if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

// ── Read Excel ─────────────────────────────────────────────────────────────────
console.log(`\nReading: ${filePath}`);
const workbook = XLSX.readFile(filePath);
const sheet    = workbook.Sheets[workbook.SheetNames[0]];
// Get as array-of-arrays (header row is at index 1, data from index 2)
const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

// Row 0: blank, Row 1: headers, Row 2+: data
const dataRows = raw.slice(2).filter(r => r[1]); // skip blank rows, require commonbarcode

console.log(`Total data rows: ${dataRows.length}`);

// ── Map rows to product records ────────────────────────────────────────────────
const newProducts = [];
const skipped     = [];

dataRows.forEach((r, i) => {
    const commonBarcode = String(r[1] || '').trim();
    const takaBarcode   = String(r[4] || '').trim();
    const itemName      = String(r[8] || '').trim();
    const colorName     = String(r[10] || '').trim().toUpperCase();
    const balPcs        = Number(r[18]) || 0;
    const rate          = Number(r[24]) || 0;

    if (!commonBarcode || !itemName) {
        skipped.push({ row: i + 3, reason: 'missing barcode or design code', data: r.slice(0, 12) });
        return;
    }

    // Build barcodes array: 13-digit commonbarcode first, 11-digit taka barcode second
    const barcodes = [commonBarcode];
    if (takaBarcode && takaBarcode !== commonBarcode) barcodes.push(takaBarcode);

    // Prefix source abbreviation to avoid barcode-space collision between shops
    const sourcePrefix = source === 'srs' ? 'srs_' : source === 'radhika' ? 'rad_' : `${source}_`;

    newProducts.push({
        uid:            sourcePrefix + commonBarcode,  // prefixed to prevent cross-shop collision
        id:             itemName,
        name:           itemName,
        compulsoryData: '',
        colors:         [],
        color:          colorName || 'General',
        rate:           rate,
        pcs:            balPcs,
        barcodes:       barcodes,
        ageDays:        0,
        isClearance:    false,
        source:         source,
        timestamp:      new Date().toISOString(),
    });
});

console.log(`Mapped: ${newProducts.length} products | Skipped: ${skipped.length}`);
if (skipped.length > 0) {
    console.log('Skipped rows:', skipped.slice(0, 5));
}

// Rate summary
const lowRate = newProducts.filter(p => p.rate > 0 && p.rate < 100);
console.log(`\nRate warnings: ${lowRate.length} rows with rate < 100 (still imported — review manually)`);
lowRate.slice(0, 5).forEach(p => console.log(`  Design ${p.id} (${p.color}): rate=${p.rate}, pcs=${p.pcs}`));

// ── Load existing products.json ────────────────────────────────────────────────
let existing = [];
if (fs.existsSync(PRODUCTS_FILE)) {
    existing = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
}
console.log(`\nExisting products in DB: ${existing.length}`);

// ── Merge: uid is primary key ──────────────────────────────────────────────────
const existingMap = new Map(existing.map(p => [p.uid, p]));
let added   = 0;
let updated = 0;

newProducts.forEach(np => {
    if (existingMap.has(np.uid)) {
        // Update: merge barcodes, keep existing imageUrl etc.
        const ex = existingMap.get(np.uid);
        const mergedBarcodes = Array.from(new Set([
            ...(ex.barcodes || []),
            ...(np.barcodes || []),
        ]));
        existingMap.set(np.uid, {
            ...ex,
            id:       np.id,
            name:     np.name,
            color:    np.color,
            rate:     np.rate,
            pcs:      np.pcs,
            source:   np.source,
            barcodes: mergedBarcodes,
            timestamp: new Date().toISOString(),
        });
        updated++;
    } else {
        existingMap.set(np.uid, np);
        added++;
    }
});

console.log(`\nImport summary: +${added} new, ~${updated} updated`);

// ── Write atomically ───────────────────────────────────────────────────────────
const merged = Array.from(existingMap.values());
fs.writeFileSync(TEMP_FILE, JSON.stringify(merged, null, 2));
fs.renameSync(TEMP_FILE, PRODUCTS_FILE);

console.log(`Done. products.json now has ${merged.length} records.\n`);
