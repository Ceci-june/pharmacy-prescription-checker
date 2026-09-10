# Offline Pharmacy Reference & Prescription Checker

A fully offline decision-support tool for pharmacy staff. Runs as a **single self-contained
HTML file** (no server, no network, no install) and ships as a **standalone Windows executable**
and a macOS app.

> **Data is not included in this repository.** The tool is data-driven: you supply your own
> drug catalogue, ICD-10 list and interaction rules as Excel files. See
> [Bring your own data](#bring-your-own-data).

---

## What it does

Six modules, all searchable, all working offline:

| Module | |
|---|---|
| **Reference** | Condition-oriented OTC reference: symptoms, red flags, treatment tiers, dosing by patient group, drug monographs |
| **Catalogue** | Editable drug catalogue — name, active ingredient, recommended ICD code, class, indications, contraindications, dosing by age, cautions & interactions |
| **Prescription checker** | Drop in a photo or clipboard screenshot of a prescription → **on-device OCR** reads the drug names → matched against the catalogue → full clinical record per drug |
| **ICD-10** | Editable diagnosis-code lookup, cross-linked to the drugs that recommend each code |
| **Interactions** | Drug-interaction registry modelled **ingredient-to-ingredient** |
| **Circulars** | Free-text store for regulatory documents |

### Safety checks

The prescription checker raises two classes of warning automatically:

- **Duplicate active ingredient** across the prescription — cumulative-overdose risk.
- **Drug–drug interaction**, severity-ranked, shown in a blocking dialog that must be
  acknowledged. The dialog re-arms only when the detected set of interactions *changes*, so
  repeated renders don't train the user to dismiss it reflexively.

Interactions are stored as **ingredient pairs, not brand pairs**. One record therefore covers
every product containing those ingredients, and the relationship is bidirectional for free —
open drug B and you see drug A without entering it twice.

---

## Design decisions worth reading

**OCR reads names, never numbers.** Measured on real hospital-software screenshots, OCR gets
drug names and ingredients right but mangles digits (`10`→`40`, `190`→`490`, `41`→`a1`). So
OCR is used *only* to identify which drug a line refers to; every dose, strength and quantity
shown comes from the catalogue. The catalogue also acts as error correction — a partly
garbled name still resolves.

**Name matching was hardened over three measured iterations**, each driven by a reproduced
failure:

1. *Keep Vietnamese diacritics.* Stripping them conflates `hở`/`ho` and `đầu`/`đau`, which made
   a cough medicine match "open wound of the head".
2. *Whole-word matching.* Prefix matching let ` ho` hit `hoạt`, `hông`, `hoặc`.
3. *Column-position weighting.* The drug name is in the first column; without this, the line
   `Usalukas 5 Natri montelukast` matched a product literally named "Natri clorid".

Where the source is truncated or ambiguous the tool **defers to the user instead of guessing** —
if a strength digit is cut off, the row goes to a "needs your choice" list rather than picking one.

**Genuinely self-contained.** UI, data, the spreadsheet engine and a 5.8 MB OCR runtime
(WebAssembly + language model) are all inlined into one file. Verified in CI-style tests that
abort every non-`file://` request: zero external requests, zero JS errors.

---

## Architecture

The shipped HTML file is a **build artifact** — never edited by hand.

```
viewer-template.html   ← the only file you edit (UI + all logic, ~100 KB)
   │  placeholders:  /*__DATA__*/   /*__XLSX__*/   /*__OCR__*/
   ▼
build-viewer.js  ──►  otc-viewer.html      (single self-contained file)
   │
   ├─ build-app.js + Neutralino  ──►  OTC-Tool.exe   (single file, resources embedded)
   └─ OTC Tool.app / .bat        ──►  launcher windows (always run the current HTML)
```

Two data tiers:

- **Build-time, read-only** — reference data inlined at build.
- **Runtime, user-owned** — catalogue, interactions, ICD codes and circulars live in
  `localStorage` and round-trip through a **four-sheet Excel file**. The ICD list is *seeded*
  from the build-time copy on first run, then belongs to the user (clearing it does not
  re-seed; a "restore defaults" button re-adds only missing entries).

### Notable engineering problems solved

- `String.replace` interprets `$&` in the replacement string. SheetJS contains the literal
  `"0$&"`, so a placeholder got spliced into the library and corrupted its number formatter.
  Fix: always pass a *function* as the replacement.
- Injecting a script tag at the **first** `</body>` broke the page — SheetJS contains the string
  `"</body></html>"`, so the `<script>` closed early and the library source dumped onto the page
  as visible text. Fix: `lastIndexOf`.
- Web Workers on the `file://` origin: Tesseract.js wraps the worker in a blob that
  `importScripts` another blob, which is blocked. Fix: concatenate the core into the worker and
  disable `workerBlobURL` — plus a **patch for an upstream bug** where the library used the
  traineddata payload instead of the language code when data is passed directly.

All three are now guarded by `build-check.js`.

---

## Testing

Run after every build:

| Script | Checks |
|---|---|
| `build-check.js` | Placeholders substituted, bundled libraries byte-intact, no stray text leaked onto the page, XLSX usable, 0 JS errors |
| `audit.js` | **Coverage audit** — asserts every string in the source data is reachable in the DOM across all UI states. Found 23 guidance passages that were permanently unreachable behind a hidden control |
| `crud-test.js` | Add / edit / delete / bulk delete / validation / persistence across reload |
| `excel-test.js` | Export → verify with an independent parser → re-import; hand-authored files; malformed input |
| `rx-test.js` | Clipboard paste, file picker, catalogue matching, duplicate-ingredient warnings |
| `ocr-test.js` | End-to-end OCR → name matching → prescription list, including truncated names and ambiguous strengths |

---

## Build

```bash
# 1. one-off: bundle the OCR runtime (needs `npm i tesseract.js`)
node crawled-data/scripts/build-ocr-assets.js

# 2. build the app
node crawled-data/scripts/build-viewer.js crawled-data \
     crawled-data/scripts/viewer-template.html otc-viewer.html

# 3. verify
node crawled-data/scripts/build-check.js

# 4. optional: standalone Windows executable
node crawled-data/scripts/build-app.js otc-viewer.html GiaiDapDuocApp
cd GiaiDapDuocApp && neu build --release --embed-resources
```

## Bring your own data

`build-viewer.js` expects JSON files in the data directory. `icd-to-json.js` converts an
ICD-10 spreadsheet; `flatten.js` and `make-xlsx.js` handle catalogue conversion. Everything the
app needs at runtime — drugs, interactions, ICD codes, circulars — can also simply be typed in,
or imported from Excel through the UI.

## Stack

Vanilla JavaScript (no framework) · Node.js build scripts · Playwright test suite ·
Tesseract.js + WebAssembly · SheetJS · Neutralino

## Licence

MIT for the code in this repository — see [LICENSE](LICENSE). Bundled third-party components
keep their own licences. No clinical data is distributed here; anything you load is yours and
stays on your machine.
