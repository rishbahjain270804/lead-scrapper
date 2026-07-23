# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Maps & Search Lead Machine PRO" — a Chrome/Edge browser extension (Manifest V3) that scrapes business leads from Google Maps and Google Search result pages, rates them as sales opportunities, and exports to XLSX/CSV/VCF. Plain vanilla JavaScript — no build system, no package manager, no tests, no lint. Changes are verified by reloading the unpacked extension (`chrome://extensions` or `edge://extensions` → Developer mode → Load unpacked → select this folder) and using it on a live Google Maps/Search tab. `node --check popup/popup.js` is a useful quick syntax gate.

## Architecture

Everything lives in the popup — there is no background service worker and no content script registered in `manifest.json`. Instead, `popup/popup.js` injects functions into the active tab on demand via `chrome.scripting.executeScript` (permissions: `activeTab`, `scripting`, `downloads`, `storage`).

`popup/popup.js` has two distinct execution contexts in one file:

1. **Popup context**: shared helpers at top level (lead schema `EXPORT_COLUMNS`, `leadKey()`, `decorateLead()`, `mergeLead()`, `generateWhatsAppLink()`, `analyzeSalesOpportunity()`), then UI state and handlers inside the `DOMContentLoaded` handler. Leads and settings persist to `chrome.storage.local` (keys `lmLeads`, `lmNextId`, `lmSettings`) — every mutation calls `saveState()`, and state is restored on popup open. Settings (country code, WhatsApp template, scroll rounds, enrichment cap) are user-editable via the ⚙️ panel.

2. **Injected functions** (top-level functions after the handler, serialized and run inside the Google page's DOM):
   - `scrapeVisibleListings` — parses Maps result cards (`a.hfpxzc` links, `.Nv2PK` cards); falls back to the single-place detail panel (`h1.DUwDvf`) when no list is present.
   - `scrapeGoogleSearchPage` — parses Google Search result blocks (`div.g`, `div.MjjYud`); captures emails into the dedicated `Email` column.
   - `scrollStep` — ONE scroll round of the Maps feed (`div[role="feed"]`), returning `{grew, atEnd, count}`; the popup loops it (`runScrollLoop`) for progress display, cancel support, and stagnation detection. Auto-Collect = scroll loop to the end + scrape.
   - `countMapListings` — returns the visible listing count.
   - `enrichSingleListing(index)` — enriches ONE listing: clicks it, confirms navigation (place-ID match, or ≥60% of name tokens — never a single shared token), and reads the detail panel. Returns `{status: 'ok'|'nav-failed'|'done', record?}`. On `nav-failed` the popup skips the listing rather than merging stale panel data. The popup drives the loop one listing at a time with a progress bar, cancel button, and incremental `saveState()` after each success.

   Injected functions cannot reference anything outside themselves (they are serialized), which is why `SOCIAL_DOMAINS` and helpers like `countDigits`/`placeIdFrom`/`readDetailPanel` are duplicated inside `scrapeVisibleListings` and `enrichSingleListing`. Never call one injected function from another.

**Lead identity/merge**: `leadKey()` prefers the Maps place ID (`0x...:0x...`, extracted from hrefs) and falls back to the name normalized to `[a-z0-9]`. Scraping fills gaps in existing leads (`mergeLead(_, _, false)`); enrichment overwrites with fresh detail-panel data (`overwrite=true`). Leads are plain objects keyed by export column names (e.g. `"Business Name"`, `"Sales Angle"`) — these string keys ARE the spreadsheet headers (order/widths defined once in `EXPORT_COLUMNS`); renaming one changes the export format and breaks the filter code that reads it. `_id` is popup-internal (list rendering/deletion) and is excluded from exports by the explicit column mapping.

**`"Has Own Website"` is three-valued**: `"Yes"` / `"No"` / `"Unknown"`. List cards and search results can only prove presence, so they emit `"Unknown"` when nothing is found; only the detail panel (single-place scrape or enrichment) is authoritative for `"No"`. `analyzeSalesOpportunity()` treats only `"No"` as a missing website — this is what keeps unenriched leads from being falsely rated "Hot Lead". Preserve this distinction when touching scraping or rating logic.

**Google DOM coupling**: all scraping depends on Google's obfuscated class names (`hfpxzc`, `Nv2PK`, `DUwDvf`, `CsEnBe`, `Io6YTe`, `F7nice`, `m6QErb`, `HlvSq`, etc.). When scraping breaks, these selectors are the first suspects; each extraction uses ordered fallback chains (language-neutral data attributes like `data-item-id="authority"` and `tel:` hrefs first → aria-labels → class selectors → regex over `innerText`) — keep that pattern when fixing. Fallback phone regex matches are accepted only when they contain 8–15 digits.

**Exports**: XLSX/CSV go through the vendored SheetJS bundle (`popup/xlsx.full.min.js`, global `XLSX` — do not edit). Column order comes from `EXPORT_COLUMNS` via `orderedExportRows()`. CSV is prefixed with a `﻿` BOM so Excel renders the emoji tiers. VCF export builds vCard text by hand (fields escaped per RFC 6350 via `vcfEscape`) and downloads via a Blob URL.

**Versioning**: the version string appears in manifest.json (twice: `version` and `default_title`), popup.html (`<title>` and badge), popup.js header comment, and README.md. Update all of them when bumping (currently 8.0).

`jaipur_gyms_leads.csv` at the repo root is sample output data, not code.
