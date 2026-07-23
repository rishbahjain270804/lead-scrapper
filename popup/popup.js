/**
 * Maps & Search Lead Generator — Master Lead Suite (v8.0 PRO for Edge & Chrome)
 *
 * Developed by JSP Coders
 * Multi-Platform Extraction: Google Maps + Google Search
 * Persistent lead storage (chrome.storage.local) — leads survive popup close.
 * Per-listing enrichment with live progress, cancel, and place-ID matching.
 */

let allLeads = [];
let currentFilter = 'all';
let searchQuery = '';
let nextLeadId = 1;
let cancelRequested = false;

const DEFAULT_SETTINGS = {
  countryCode: '91',
  waTemplate: 'Hello {name}, I found your listing and would love to share a special proposal!',
  scrollRounds: 6,
  enrichCap: 50
};
let settings = { ...DEFAULT_SETTINGS };

// Ordered by sales priority — these keys ARE the spreadsheet headers.
const EXPORT_COLUMNS = [
  ["Sales Angle", 32],
  ["Business Name", 32],
  ["Phone", 18],
  ["WhatsApp Link", 45],
  ["Email", 26],
  ["Address", 45],
  ["Website", 30],
  ["Has Own Website", 16],
  ["Category", 20],
  ["Rating", 8],
  ["Reviews", 8],
  ["Social Media", 30],
  ["Instagram Search", 35],
  ["Facebook Search", 35],
  ["Maps URL", 35],
  ["Place ID", 24]
];

// ── Shared helpers (popup context) ──

function digitCount(str) {
  return (String(str || '').match(/\d/g) || []).length;
}

function hasPhone(lead) {
  return digitCount(lead.Phone) >= 7;
}

function leadKey(item) {
  const placeId = (item["Place ID"] || '').trim();
  if (placeId) return 'id:' + placeId;
  return 'name:' + (item["Business Name"] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateWhatsAppLink(phone, name) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length < 7) return '';

  // Strip the trunk prefix from 11-digit numbers (e.g. 09680038787 → 9680038787)
  // so the country code applies and the wa.me link works.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  let formattedPhone = digits;
  const cc = (settings.countryCode || '').replace(/\D/g, '');
  if (digits.length === 10 && cc && !String(phone).trim().startsWith('+')) {
    formattedPhone = cc + digits;
  }

  const message = encodeURIComponent((settings.waTemplate || '').split('{name}').join(name || ''));
  return `https://wa.me/${formattedPhone}?text=${message}`;
}

function analyzeSalesOpportunity(item) {
  const phoneOk = hasPhone(item);
  // Only a CONFIRMED missing website counts — "Unknown" (unenriched list card) does not.
  const hasNoWebsite = item["Has Own Website"] === "No";
  const ratingNum = parseFloat(item.Rating) || 0;
  const reviewNum = parseInt(item.Reviews, 10) || 0;

  if (phoneOk && hasNoWebsite && reviewNum >= 30) {
    return '🔥 Hot Web Design Deal ($1,000+ High Income & No Web)';
  } else if (phoneOk && hasNoWebsite) {
    return '🔥 Hot Lead (No Website - Pitch Web Creation)';
  } else if (phoneOk && ratingNum > 0 && ratingNum < 4.2) {
    return '⭐ Review Pitch (Rating Below 4.2 - Pitch Reputation)';
  } else if (phoneOk) {
    return '⚡ Warm Lead (Direct Sales Target)';
  } else {
    return '❄️ Prospect';
  }
}

function decorateLead(item) {
  for (const [key] of EXPORT_COLUMNS) {
    if (item[key] === undefined || item[key] === null) item[key] = '';
  }
  if (!item._id) item._id = nextLeadId++;
  item["WhatsApp Link"] = generateWhatsAppLink(item.Phone, item["Business Name"]);
  item["Sales Angle"] = analyzeSalesOpportunity(item);
  item["Instagram Search"] = `https://www.google.com/search?q=site:instagram.com+"${encodeURIComponent(item["Business Name"])}"`;
  item["Facebook Search"] = `https://www.google.com/search?q=site:facebook.com+"${encodeURIComponent(item["Business Name"])}"`;
  return item;
}

// Fill empty fields of `target` from `fresh`; if overwrite, fresh non-empty values win.
function mergeLead(target, fresh, overwrite) {
  for (const [key] of EXPORT_COLUMNS) {
    if (key === "Sales Angle" || key === "WhatsApp Link" ||
        key === "Instagram Search" || key === "Facebook Search") continue;
    const freshVal = (fresh[key] || '').toString().trim();
    if (!freshVal || freshVal === 'Unknown') continue;
    const curVal = (target[key] || '').toString().trim();
    if (overwrite || !curVal || curVal === 'Unknown') target[key] = freshVal;
  }
  decorateLead(target);
}

function saveState() {
  try {
    chrome.storage.local.set({ lmLeads: allLeads, lmNextId: nextLeadId });
  } catch (e) {
    console.error('saveState error:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const scrapeBtn      = document.getElementById('scrapeBtn');
  const scrollBtn      = document.getElementById('scrollBtn');
  const autoBtn        = document.getElementById('autoBtn');
  const enrichBtn      = document.getElementById('enrichBtn');
  const cancelBtn      = document.getElementById('cancelBtn');
  const exportXlsxBtn  = document.getElementById('exportXlsxBtn');
  const exportCsvBtn   = document.getElementById('exportCsvBtn');
  const exportVcfBtn   = document.getElementById('exportVcfBtn');
  const clearBtn       = document.getElementById('clearBtn');
  const leadCount      = document.getElementById('leadCount');
  const phoneCount     = document.getElementById('phoneCount');
  const hotCount       = document.getElementById('hotCount');
  const statusText     = document.getElementById('statusText');
  const alertBox       = document.getElementById('alertBox');
  const searchInput    = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const chips          = document.querySelectorAll('.chip');
  const leadList       = document.getElementById('leadList');
  const progressWrap   = document.getElementById('progressWrap');
  const progressBar    = document.getElementById('progressBar');
  const progressLabel  = document.getElementById('progressLabel');
  const settingsBtn    = document.getElementById('settingsBtn');
  const settingsPanel  = document.getElementById('settingsPanel');
  const saveSettingsBtn   = document.getElementById('saveSettingsBtn');
  const countryCodeInput  = document.getElementById('countryCodeInput');
  const waTemplateInput   = document.getElementById('waTemplateInput');
  const scrollRoundsInput = document.getElementById('scrollRoundsInput');
  const enrichCapInput    = document.getElementById('enrichCapInput');

  function showAlert(msg, type = 'info') {
    alertBox.textContent = msg;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 5000);
  }

  function getFilteredLeads() {
    return allLeads.filter(l => {
      // Filter type
      if (currentFilter === 'hot' && !(l["Sales Angle"] || '').includes('Hot')) return false;
      if (currentFilter === 'phone' && !hasPhone(l)) return false;
      if (currentFilter === 'noweb' && l["Has Own Website"] !== "No") return false;

      // Deep Text Search
      if (searchQuery) {
        const text = `${l["Business Name"]} ${l.Category} ${l.Address} ${l.Phone} ${l.Email} ${l.Website} ${l["Sales Angle"]} ${l["Maps URL"]}`.toLowerCase();
        if (!text.includes(searchQuery)) return false;
      }
      return true;
    });
  }

  function angleBadge(angle) {
    const a = angle || '';
    if (a.includes('Hot')) return ['🔥', 'badge-hot'];
    if (a.includes('Review')) return ['⭐', 'badge-review'];
    if (a.includes('Warm')) return ['⚡', 'badge-warm'];
    return ['❄️', 'badge-cold'];
  }

  const MAX_RENDERED_ROWS = 300;

  function renderLeads(filtered) {
    leadList.replaceChildren();

    if (allLeads.length === 0) return;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lead-empty';
      empty.textContent = 'No leads match the current filter.';
      leadList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.slice(0, MAX_RENDERED_ROWS).forEach(lead => {
      const row = document.createElement('div');
      row.className = 'lead-row';

      const info = document.createElement('div');
      info.className = 'lead-info';

      const nameEl = document.createElement(lead["Maps URL"] ? 'a' : 'span');
      nameEl.className = 'lead-name';
      nameEl.textContent = lead["Business Name"] || '(unnamed)';
      if (lead["Maps URL"]) {
        nameEl.href = lead["Maps URL"];
        nameEl.target = '_blank';
        nameEl.rel = 'noopener';
        nameEl.title = 'Open in Google Maps';
      }
      info.appendChild(nameEl);

      const sub = document.createElement('div');
      sub.className = 'lead-sub';
      const subParts = [];
      subParts.push(hasPhone(lead) ? `📞 ${lead.Phone}` : 'no phone');
      if (lead.Category) subParts.push(lead.Category);
      if (lead["Has Own Website"] === "No") subParts.push('no website');
      sub.textContent = subParts.join(' · ');
      info.appendChild(sub);
      row.appendChild(info);

      const [icon, cls] = angleBadge(lead["Sales Angle"]);
      const badge = document.createElement('span');
      badge.className = `lead-badge ${cls}`;
      badge.textContent = icon;
      badge.title = lead["Sales Angle"] || '';
      row.appendChild(badge);

      if (lead["WhatsApp Link"]) {
        const wa = document.createElement('a');
        wa.className = 'lead-wa';
        wa.href = lead["WhatsApp Link"];
        wa.target = '_blank';
        wa.rel = 'noopener';
        wa.textContent = '💬';
        wa.title = 'Open WhatsApp chat';
        row.appendChild(wa);
      }

      const del = document.createElement('button');
      del.className = 'lead-del';
      del.textContent = '×';
      del.title = 'Delete lead';
      del.dataset.id = lead._id;
      row.appendChild(del);

      frag.appendChild(row);
    });

    if (filtered.length > MAX_RENDERED_ROWS) {
      const note = document.createElement('div');
      note.className = 'lead-list-note';
      note.textContent = `Showing first ${MAX_RENDERED_ROWS} of ${filtered.length} — all are included in exports.`;
      frag.appendChild(note);
    }

    leadList.appendChild(frag);
  }

  // Delete lead (event delegation)
  leadList.addEventListener('click', (e) => {
    const btn = e.target.closest('.lead-del');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    allLeads = allLeads.filter(l => l._id !== id);
    saveState();
    updateStats();
  });

  function updateStats() {
    leadCount.textContent = allLeads.length;
    phoneCount.textContent = allLeads.filter(hasPhone).length;
    hotCount.textContent = allLeads.filter(l => (l["Sales Angle"] || '').includes('Hot')).length;

    const hasLeads = allLeads.length > 0;
    exportXlsxBtn.disabled = !hasLeads;
    exportCsvBtn.disabled  = !hasLeads;
    if (exportVcfBtn) exportVcfBtn.disabled = !hasLeads;
    enrichBtn.disabled = false; // enrichment can also DISCOVER leads, not just update them

    const filtered = getFilteredLeads();
    if (searchQuery || currentFilter !== 'all') {
      if (filtered.length === 0 && hasLeads) {
        statusText.textContent = `0 leads match "${searchQuery || currentFilter}". Click 'Clear Search' to view all ${allLeads.length} leads.`;
      } else {
        statusText.textContent = `Showing ${filtered.length} of ${allLeads.length} leads.`;
      }
    } else {
      statusText.textContent = `Total: ${allLeads.length} leads. Click "Fetch Phone & Details" if on Maps.`;
    }

    renderLeads(filtered);
  }

  // ── Busy state / progress / cancel ──

  const actionButtons = [scrapeBtn, scrollBtn, autoBtn, enrichBtn];

  function setBusy(busy) {
    actionButtons.forEach(b => { b.disabled = busy; });
    cancelBtn.style.display = busy ? 'flex' : 'none';
    if (!busy) {
      progressWrap.style.display = 'none';
      enrichBtn.disabled = false;
      cancelRequested = false;
    }
  }

  function showProgress(done, total, label) {
    progressWrap.style.display = 'flex';
    progressBar.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
    progressLabel.textContent = label;
  }

  cancelBtn.addEventListener('click', () => {
    cancelRequested = true;
    cancelBtn.textContent = '⏳ Stopping...';
  });

  function resetCancelBtn() {
    cancelBtn.textContent = '✋ Cancel';
  }

  // ── Settings ──

  function populateSettingsInputs() {
    countryCodeInput.value = settings.countryCode;
    waTemplateInput.value = settings.waTemplate;
    scrollRoundsInput.value = settings.scrollRounds;
    enrichCapInput.value = settings.enrichCap;
  }

  settingsBtn.addEventListener('click', () => {
    const open = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = open ? 'none' : 'flex';
    settingsBtn.classList.toggle('active', !open);
  });

  saveSettingsBtn.addEventListener('click', () => {
    settings.countryCode = countryCodeInput.value.replace(/\D/g, '');
    settings.waTemplate = waTemplateInput.value || DEFAULT_SETTINGS.waTemplate;
    settings.scrollRounds = Math.min(40, Math.max(1, parseInt(scrollRoundsInput.value, 10) || DEFAULT_SETTINGS.scrollRounds));
    settings.enrichCap = Math.min(500, Math.max(1, parseInt(enrichCapInput.value, 10) || DEFAULT_SETTINGS.enrichCap));
    populateSettingsInputs();
    chrome.storage.local.set({ lmSettings: settings });

    // Re-generate WhatsApp links with the new country code / template
    allLeads.forEach(decorateLead);
    saveState();
    updateStats();
    showAlert('Settings saved. WhatsApp links regenerated.', 'success');
  });

  // ── Filter Chips Listener ──
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter');
      updateStats();
    });
  });

  // ── Live Search Input ──
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      if (clearSearchBtn) clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
      updateStats();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      updateStats();
    });
  }

  async function getActiveTab() {
    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true });
      }
      if (!tabs || tabs.length === 0) return null;

      const mapOrSearchTab = tabs.find(t => t.url && (t.url.includes('google.com/maps') || t.url.includes('google.com/search')));
      if (mapOrSearchTab) return mapOrSearchTab;

      const tab = tabs[0];
      if (tab && tab.url && (tab.url.includes('google.com/maps') || tab.url.includes('google.com/search'))) return tab;
    } catch (e) {
      console.error('getActiveTab error:', e);
    }
    return null;
  }

  async function execInTab(tabId, func, args = []) {
    const results = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return results[0]?.result;
  }

  // ── Lead intake (shared by scrape + auto-collect) ──

  function addScrapedLeads(data) {
    const existing = new Map(allLeads.map(l => [leadKey(l), l]));
    let newCount = 0;
    let mergedCount = 0;

    for (const item of data) {
      if (!(item["Business Name"] || '').trim()) continue;
      const key = leadKey(item);
      const found = existing.get(key);
      if (found) {
        mergeLead(found, item, false); // fill gaps only, never clobber enriched data
        mergedCount++;
      } else {
        decorateLead(item);
        allLeads.push(item);
        existing.set(key, item);
        newCount++;
      }
    }
    return { newCount, mergedCount };
  }

  async function doScrape(tab) {
    const isMaps = tab.url.includes('google.com/maps');
    const scrapeFunc = isMaps ? scrapeVisibleListings : scrapeGoogleSearchPage;

    const data = (await execInTab(tab.id, scrapeFunc)) || [];

    if (data.length === 0) {
      showAlert('No leads found. Make sure search results are visible.', 'error');
      statusText.textContent = 'No listings found. Try searching first.';
      return;
    }

    const { newCount } = addScrapedLeads(data);
    const hots = allLeads.filter(l => (l["Sales Angle"] || '').includes('Hot')).length;
    saveState();
    showAlert(`Scraped ${data.length} leads (${newCount} new, ${hots} Hot Deals)!`, 'success');
    updateStats();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  1. SCRAPE BUTTON
  // ═══════════════════════════════════════════════════════════════════════
  scrapeBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) {
      showAlert('Please open Google Maps or Google Search tab first!', 'error');
      return;
    }

    setBusy(true);
    scrapeBtn.textContent = '⏳ Scraping...';
    statusText.textContent = 'Extracting leads with AI Sales Intelligence...';

    try {
      await doScrape(tab);
    } catch (e) {
      console.error(e);
      showAlert('Scrape error: ' + e.message, 'error');
    }

    setBusy(false);
    scrapeBtn.textContent = '⚡ Scrape This Page';
  });

  // ── Scroll loop (shared by scroll + auto-collect) ──
  // Returns { count, atEnd, error } after up to maxRounds scroll steps.
  async function runScrollLoop(tabId, maxRounds, labelPrefix) {
    let stagnant = 0;
    let count = 0;

    for (let round = 1; round <= maxRounds; round++) {
      if (cancelRequested) return { count, atEnd: false };

      const res = await execInTab(tabId, scrollStep);
      if (!res || res.error) {
        return { count, atEnd: false, error: res?.error || 'Scroll failed.' };
      }

      count = res.count;
      showProgress(round, maxRounds, `${labelPrefix}: round ${round}/${maxRounds} — ${count} listings loaded`);

      if (res.atEnd) return { count, atEnd: true };
      if (!res.grew) {
        stagnant++;
        if (stagnant >= 2) return { count, atEnd: true }; // nothing new twice in a row → stop
      } else {
        stagnant = 0;
      }
    }
    return { count, atEnd: false };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  2. SCROLL BUTTON
  // ═══════════════════════════════════════════════════════════════════════
  scrollBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.url.includes('google.com/maps')) {
      showAlert('Please open Google Maps tab first!', 'error');
      return;
    }

    setBusy(true);
    scrollBtn.textContent = '📜 Scrolling...';

    try {
      const res = await runScrollLoop(tab.id, settings.scrollRounds, 'Scrolling');
      if (res.error) {
        showAlert(res.error, 'error');
      } else {
        const msg = res.atEnd
          ? `Reached end of list — ${res.count} listings visible.`
          : `Scrolled ${settings.scrollRounds} rounds — ${res.count} listings visible.`;
        statusText.textContent = msg + ' Now click "Scrape This Page".';
        showAlert(msg, 'info');
      }
    } catch (e) {
      console.error(e);
      showAlert('Scroll error: ' + e.message, 'error');
    }

    setBusy(false);
    resetCancelBtn();
    scrollBtn.textContent = '📜 Scroll & Load More';
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  3. AUTO-COLLECT BUTTON (scroll to the end, then scrape)
  // ═══════════════════════════════════════════════════════════════════════
  autoBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.url.includes('google.com/maps')) {
      showAlert('Auto-Collect works on a Google Maps results tab.', 'error');
      return;
    }

    setBusy(true);
    autoBtn.textContent = '🤖 Collecting...';

    try {
      const res = await runScrollLoop(tab.id, 40, 'Auto-Collect');
      if (res.error) {
        showAlert(res.error, 'error');
      } else {
        statusText.textContent = 'Scrolling done — scraping all listings...';
        await doScrape(tab);
      }
    } catch (e) {
      console.error(e);
      showAlert('Auto-Collect error: ' + e.message, 'error');
    }

    setBusy(false);
    resetCancelBtn();
    autoBtn.textContent = '🤖 Auto-Collect All';
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  4. ENRICH BUTTON (per-listing, with progress, cancel & incremental save)
  // ═══════════════════════════════════════════════════════════════════════

  function applyEnrichedRecord(record) {
    const key = leadKey(record);
    let found = allLeads.find(l => leadKey(l) === key);
    if (!found && record["Place ID"]) {
      // Lead may have been scraped before its place ID was known — fall back to name match.
      const nameKey = 'name:' + (record["Business Name"] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      found = allLeads.find(l => leadKey(l) === nameKey);
    }
    if (found) {
      mergeLead(found, record, true); // enriched detail-panel data wins
    } else {
      decorateLead(record);
      allLeads.push(record); // enrichment can discover leads not yet scraped
    }
  }

  enrichBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.url.includes('google.com/maps')) {
      showAlert('Please open Google Maps tab first!', 'error');
      return;
    }

    setBusy(true);
    enrichBtn.textContent = '📞 Fetching Details...';
    statusText.textContent = 'Navigating listings to extract Phone, Address & Socials...';

    try {
      const listingCount = (await execInTab(tab.id, countMapListings)) || 0;
      let okCount = 0;
      const failed = [];

      if (listingCount === 0) {
        // Single place open — enrich the visible detail panel.
        const res = await execInTab(tab.id, enrichSingleListing, [0]);
        if (res && res.record) {
          applyEnrichedRecord(res.record);
          okCount = 1;
          saveState();
          updateStats();
        }
      } else {
        const cap = Math.min(listingCount, settings.enrichCap);
        if (listingCount > cap) {
          showAlert(`Enriching first ${cap} of ${listingCount} listings (raise the limit in ⚙️ Settings).`, 'info');
        }

        for (let i = 0; i < cap; i++) {
          if (cancelRequested) break;
          showProgress(i, cap, `Enriching listing ${i + 1} of ${cap}...`);

          const res = await execInTab(tab.id, enrichSingleListing, [i]);
          if (res && res.status === 'ok' && res.record) {
            applyEnrichedRecord(res.record);
            okCount++;
            saveState();     // incremental — progress survives popup close
            updateStats();
          } else if (res && res.status === 'nav-failed') {
            failed.push(res.name); // skip stale panel data rather than mis-attribute it
          }
        }
        showProgress(cap, cap, 'Done.');
      }

      const withPhone = allLeads.filter(hasPhone).length;
      const hots = allLeads.filter(l => (l["Sales Angle"] || '').includes('Hot')).length;

      if (okCount > 0) {
        let msg = `Enriched ${okCount} listings — ${withPhone} phones, ${hots} Hot Deals.`;
        if (failed.length) msg += ` Skipped ${failed.length} (could not open listing).`;
        if (cancelRequested) msg += ' (Cancelled early — progress saved.)';
        showAlert(msg, 'success');
      } else {
        showAlert('No additional details found.', 'info');
      }

      updateStats();
    } catch (e) {
      console.error(e);
      showAlert('Enrichment error: ' + e.message, 'error');
    }

    setBusy(false);
    resetCancelBtn();
    enrichBtn.textContent = '📞 Fetch Phone & Details';
  });

  // ── Export helpers ──

  function orderedExportRows(list) {
    return list.map(l => {
      const row = {};
      for (const [key] of EXPORT_COLUMNS) row[key] = l[key] || '';
      return row;
    });
  }

  function getExportList() {
    let listToExport = getFilteredLeads();
    if (listToExport.length === 0 && allLeads.length > 0) {
      listToExport = allLeads;
      showAlert(`Search filter produced 0 matches. Exported all ${allLeads.length} leads!`, 'info');
    }
    return listToExport;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const dateStr = () => new Date().toISOString().slice(0, 10);

  // ═══════════════════════════════════════════════════════════════════════
  //  5. EXPORT EXCEL (.xlsx)
  // ═══════════════════════════════════════════════════════════════════════
  exportXlsxBtn.addEventListener('click', () => {
    const listToExport = getExportList();
    if (listToExport.length === 0) return;

    try {
      const worksheet = XLSX.utils.json_to_sheet(orderedExportRows(listToExport), {
        header: EXPORT_COLUMNS.map(c => c[0])
      });
      worksheet['!cols'] = EXPORT_COLUMNS.map(c => ({ wch: c[1] }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "JSP Coders Master Leads");

      const filename = `jsp_coders_leads_${dateStr()}.xlsx`;
      XLSX.writeFile(workbook, filename);
      showAlert(`Exported ${listToExport.length} leads to ${filename}!`, 'success');
    } catch (err) {
      console.error('XLSX Export Error:', err);
      showAlert('Export error: ' + err.message, 'error');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  6. EXPORT CSV (.csv) — UTF-8 BOM so Excel renders emoji correctly
  // ═══════════════════════════════════════════════════════════════════════
  exportCsvBtn.addEventListener('click', () => {
    const listToExport = getExportList();
    if (listToExport.length === 0) return;

    try {
      const worksheet = XLSX.utils.json_to_sheet(orderedExportRows(listToExport), {
        header: EXPORT_COLUMNS.map(c => c[0])
      });
      const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(worksheet); // BOM so Excel renders emoji/UTF-8 correctly
      const filename = `jsp_coders_leads_${dateStr()}.csv`;
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
      showAlert(`Exported ${listToExport.length} leads to ${filename}!`, 'success');
    } catch (err) {
      console.error('CSV Export Error:', err);
      showAlert('Export error: ' + err.message, 'error');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  7. EXPORT PHONE CONTACTS (.vcf / vCard) — RFC 6350 escaping
  // ═══════════════════════════════════════════════════════════════════════
  function vcfEscape(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/([,;])/g, '\\$1');
  }

  if (exportVcfBtn) {
    exportVcfBtn.addEventListener('click', () => {
      let listToExport = getFilteredLeads().filter(hasPhone);
      if (listToExport.length === 0 && allLeads.length > 0) {
        listToExport = allLeads.filter(hasPhone);
      }

      if (listToExport.length === 0) {
        showAlert('No leads with phone numbers to export.', 'error');
        return;
      }

      let vcfContent = '';
      listToExport.forEach(lead => {
        const cleanPhone = lead.Phone.replace(/[^\d+]/g, '');
        vcfContent += `BEGIN:VCARD\r\n`;
        vcfContent += `VERSION:3.0\r\n`;
        vcfContent += `FN:${vcfEscape(lead["Business Name"])}\r\n`;
        vcfContent += `TEL;TYPE=CELL:${cleanPhone}\r\n`;
        if (lead.Address) vcfContent += `ADR;TYPE=WORK:;;${vcfEscape(lead.Address)};;;;\r\n`;
        if (lead.Website) vcfContent += `URL:${vcfEscape(lead.Website)}\r\n`;
        if (lead.Email) vcfContent += `EMAIL:${vcfEscape(lead.Email)}\r\n`;
        vcfContent += `NOTE:${vcfEscape(`${lead["Sales Angle"]} | Category: ${lead.Category}`)}\r\n`;
        vcfContent += `END:VCARD\r\n`;
      });

      const filename = `jsp_coders_contacts_${dateStr()}.vcf`;
      downloadBlob(new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' }), filename);
      showAlert(`Exported ${listToExport.length} phone contacts to .vcf file!`, 'success');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  8. CLEAR BUTTON
  // ═══════════════════════════════════════════════════════════════════════
  clearBtn.addEventListener('click', () => {
    allLeads = [];
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    currentFilter = 'all';
    chips.forEach(c => c.classList.remove('active'));
    if (chips[0]) chips[0].classList.add('active');
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';

    saveState();
    updateStats();
    statusText.textContent = 'Data cleared. Ready for fresh scraping.';
  });

  // ── Init: restore persisted leads + settings ──
  (async () => {
    try {
      const stored = await chrome.storage.local.get({ lmLeads: [], lmNextId: 1, lmSettings: null });
      allLeads = Array.isArray(stored.lmLeads) ? stored.lmLeads : [];
      nextLeadId = stored.lmNextId || 1;
      settings = { ...DEFAULT_SETTINGS, ...(stored.lmSettings || {}) };
      allLeads.forEach(l => { if (!l._id) l._id = nextLeadId++; });
    } catch (e) {
      console.error('State restore error:', e);
    }
    populateSettingsInputs();
    updateStats();
    if (allLeads.length > 0) {
      statusText.textContent = `Restored ${allLeads.length} saved leads. Ready to continue.`;
    }
  })();
});


// ═══════════════════════════════════════════════════════════════════════════
//  INJECTED FUNCTIONS (Runs inside Google Maps & Google Search DOM)
//
//  IMPORTANT: these are serialized individually by chrome.scripting.executeScript
//  and CANNOT reference anything outside their own body — all helpers and
//  constants must be duplicated inside each function.
// ═══════════════════════════════════════════════════════════════════════════

function scrapeGoogleSearchPage() {
  const countDigits = s => (String(s || '').match(/\d/g) || []).length;

  const results = [];
  const searchBlocks = document.querySelectorAll('div.g, div.MjjYud');
  console.log('[LeadMachine] Search scrape: found', searchBlocks.length, 'result blocks');

  searchBlocks.forEach(block => {
    try {
      const titleEl = block.querySelector('h3');
      if (!titleEl) return;

      const name = titleEl.innerText.trim();
      const linkEl = block.querySelector('a');
      const href = linkEl ? linkEl.href : '';
      const snippetEl = block.querySelector('div.VwiC3b, div.IsZvec');
      const text = snippetEl ? snippetEl.innerText : block.innerText;

      console.groupCollapsed('[LeadMachine] search block:', name);
      console.log('snippet text:', JSON.stringify(text));

      // Try EVERY candidate, not just the first match — the first digit run in
      // a snippet is often a date/price, with the real phone further along.
      let phone = '';
      const candidates = text.match(/\+?\d[\d\s\-().]{6,18}\d/g) || [];
      for (const c of candidates) {
        const d = countDigits(c);
        if (!phone && d >= 8 && d <= 15) {
          phone = c.trim();
          console.log(`phone candidate ACCEPTED: "${c}" (${d} digits)`);
        } else {
          console.log(`phone candidate rejected: "${c}" (${d} digits${phone ? ', already have one' : ', need 8-15'})`);
        }
      }
      if (candidates.length === 0) console.log('phone: no candidates in snippet');

      let email = '';
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) email = emailMatch[0];

      const website = href && !href.includes('google.com') ? href : '';
      // A search hit link proves a web presence; its absence proves nothing.
      const hasOwnWebsite = website ? 'Yes' : 'Unknown';
      console.log('website decision:', href ? `link "${href}" → ${website ? 'own website (Yes)' : 'google link, ignored (Unknown)'}` : 'no link (Unknown)');
      console.log('final:', { phone, email, website });
      console.groupEnd();

      results.push({
        "Business Name": name,
        "Category": "Google Search Lead",
        "Rating": "",
        "Reviews": "",
        "Phone": phone,
        "Email": email,
        "Address": "",
        "Website": website,
        "Has Own Website": hasOwnWebsite,
        "Social Media": "",
        "Maps URL": href,
        "Place ID": ""
      });
    } catch (e) {
      console.error('Google search parse error:', e);
    }
  });

  return results;
}

function scrapeVisibleListings() {
  const SOCIAL_DOMAINS = [
    'instagram.com', 'facebook.com', 'fb.com', 'twitter.com', 'x.com',
    'youtube.com', 'youtu.be', 'linkedin.com', 'tiktok.com', 'pinterest.com',
    'snapchat.com', 'threads.net', 'wa.me', 'whatsapp.com', 't.me',
    'telegram.me', 'reddit.com', 'tumblr.com'
  ];
  const countDigits = s => (String(s || '').match(/\d/g) || []).length;
  const isValidPhone = s => countDigits(s) >= 8 && countDigits(s) <= 15;
  const placeIdFrom = url => {
    const m = String(url || '').match(/1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
    return m ? m[1] : '';
  };

  function extractCurrentDetailPanel() {
    const titleEl = document.querySelector('h1.DUwDvf');
    if (!titleEl) return null;

    const bName = titleEl.innerText.trim();
    if (!bName) return null;

    let phone = '';
    const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]') ||
                     document.querySelector('button.CsEnBe[aria-label^="Phone:"]') ||
                     document.querySelector('button[aria-label^="Phone:"]') ||
                     document.querySelector('button[aria-label*="Call"]') ||
                     document.querySelector('a[href^="tel:"]');

    if (phoneBtn) {
      const href = phoneBtn.getAttribute('href') || '';
      const dataId = phoneBtn.getAttribute('data-item-id') || '';
      const textDiv = phoneBtn.querySelector('.Io6YTe')?.innerText || '';
      const ariaLabel = phoneBtn.getAttribute('aria-label') || '';

      phone = href.replace('tel:', '').trim() ||
              dataId.replace('phone:tel:', '').trim() ||
              textDiv.trim() ||
              ariaLabel.replace(/^Phone:\s*/i, '').replace(/^Call\s*/i, '').trim();
    }

    if (!phone) {
      const csButtons = Array.from(document.querySelectorAll('.CsEnBe'));
      for (const btn of csButtons) {
        const aria = btn.getAttribute('aria-label') || '';
        const dataId = btn.getAttribute('data-item-id') || '';
        if (dataId.startsWith('phone:tel:') || aria.toLowerCase().includes('phone') || aria.toLowerCase().includes('call')) {
          phone = dataId.replace('phone:tel:', '').trim() ||
                  btn.querySelector('.Io6YTe')?.innerText ||
                  aria.replace(/^Phone:\s*/i, '').replace(/^Call\s*/i, '').trim();
          if (phone) break;
        }
      }
    }

    if (!phone) {
      const panel = document.querySelector('div[role="main"]') || document.querySelector('.m6QErb');
      const mainText = panel ? panel.innerText : '';
      const candidates = mainText.match(/\+?\d[\d\s\-().]{6,18}\d/g) || [];
      for (const c of candidates) {
        if (isValidPhone(c)) {
          phone = c.trim();
          console.log(`[LeadMachine] panel-text phone fallback ACCEPTED: "${c}"`);
          break;
        }
        console.log(`[LeadMachine] panel-text phone fallback rejected: "${c}" (need 8-15 digits)`);
      }
    }

    let address = '';
    const addressBtn = document.querySelector('button[data-item-id="address"]') ||
                       document.querySelector('button.CsEnBe[aria-label^="Address:"]') ||
                       document.querySelector('button[aria-label^="Address:"]');

    if (addressBtn) {
      const textDiv = addressBtn.querySelector('.Io6YTe')?.innerText || '';
      const ariaLabel = addressBtn.getAttribute('aria-label') || '';
      address = textDiv.trim() || ariaLabel.replace(/^Address:\s*/i, '').trim();
    }

    let website = '';
    let socialMedia = '';
    let hasOwnWebsite = 'No'; // detail panel is authoritative — absence here IS a missing website

    const websiteEl = document.querySelector('a[data-item-id="authority"]') ||
                      document.querySelector('a.CsEnBe[aria-label^="Website:"]') ||
                      document.querySelector('a[aria-label^="Website:"]');

    if (websiteEl && websiteEl.href) {
      const raw = websiteEl.href;
      const isSocial = SOCIAL_DOMAINS.some(d => raw.includes(d));
      if (isSocial) {
        socialMedia = raw;
      } else {
        website = raw;
        hasOwnWebsite = 'Yes';
      }
    }

    let rating = '';
    const ratingEl = document.querySelector('div.F7nice > span > span[aria-hidden="true"]') ||
                     document.querySelector('span.MW4etd');
    if (ratingEl) rating = ratingEl.innerText.trim();

    let reviews = '';
    const reviewEl = document.querySelector('div.F7nice span[role="img"]') ||
                     document.querySelector('span.UY7F9');
    if (reviewEl) {
      const aria = reviewEl.getAttribute('aria-label') || '';
      const m = aria.match(/([\d,.]+)/);
      if (m) {
        reviews = m[1].replace(/[,.]/g, '');
      } else {
        reviews = reviewEl.innerText.replace(/[(),\s]/g, '').trim();
      }
    }

    let category = '';
    const catEl = document.querySelector('button[jsaction*="category"]') ||
                  document.querySelector('.DkV0ie');
    if (catEl) category = catEl.innerText.trim();

    return {
      "Business Name": bName,
      "Category": category,
      "Rating": rating,
      "Reviews": reviews,
      "Phone": phone,
      "Email": "",
      "Address": address,
      "Website": website,
      "Has Own Website": hasOwnWebsite,
      "Social Media": socialMedia,
      "Maps URL": window.location.href.split('?')[0],
      "Place ID": placeIdFrom(window.location.href)
    };
  }

  const results = [];
  const links = document.querySelectorAll('a.hfpxzc');
  console.log('[LeadMachine] List scrape: found', links.length, 'listing links');

  if (links.length === 0) {
    console.log('[LeadMachine] No list links — falling back to single-place detail panel');
    const singlePlace = extractCurrentDetailPanel();
    if (singlePlace) results.push(singlePlace);
    return results;
  }

  links.forEach(link => {
    try {
      const name = link.getAttribute('aria-label') || '';
      if (!name) return;

      const mapsURL = (link.href || '').split('?')[0];
      let card = link.closest('.Nv2PK') || link.parentElement;
      if (!card) return;

      const cardText = card.innerText || '';
      const lines = cardText.split('\n').map(l => l.trim()).filter(l => l);

      console.groupCollapsed('[LeadMachine] card:', name);
      console.log('raw card lines:', lines);

      let rating = '';
      const ratingMatch = cardText.match(/(\d\.\d)\s*\(/);
      if (ratingMatch) rating = ratingMatch[1];

      let reviews = '';
      const reviewMatch = cardText.match(/\(([\d,\.]+)\)/);
      if (reviewMatch) reviews = reviewMatch[1].replace(/,/g, '');

      let category = '';
      for (const line of lines) {
        if (line !== name && !line.match(/^\d/) && !line.match(/^\(/) &&
            !line.includes('·') && line.length < 35 && line.length > 2 &&
            !line.match(/Open|Closed|hour/i) && !line.match(/^\$/) &&
            !line.match(/^\+?\d[\d\s()-]{6,}/)) {
          category = line;
          break;
        }
      }

      // Try EVERY candidate digit-run in the card text, not just the first —
      // ratings/review counts/pincodes get rejected by the 8-15 digit rule
      // and the real phone is often a later match.
      let phone = '';
      let phoneSource = '';
      const candidates = cardText.match(/\+?\d[\d\s\-().]{6,18}\d/g) || [];
      for (const c of candidates) {
        const d = countDigits(c);
        if (!phone && d >= 8 && d <= 15) {
          phone = c.trim();
          phoneSource = 'card text regex';
          console.log(`phone candidate ACCEPTED: "${c}" (${d} digits)`);
        } else {
          console.log(`phone candidate rejected: "${c}" (${d} digits${phone ? ', already have one' : ', need 8-15'})`);
        }
      }
      if (candidates.length === 0) console.log('phone: no digit-run candidates in card text');

      const phoneBtn = card.querySelector('button[aria-label*="Call"]') || card.querySelector('a[href^="tel:"]');
      if (phoneBtn) {
        const href = phoneBtn.getAttribute('href') || '';
        const aria = phoneBtn.getAttribute('aria-label') || '';
        if (href.startsWith('tel:')) {
          phone = href.replace('tel:', '').trim();
          phoneSource = 'tel: link';
        } else if (aria) {
          phone = aria.replace(/^Call\s*/i, '').replace(/^Phone:\s*/i, '').trim();
          phoneSource = 'Call button aria-label';
        }
        console.log(`phone OVERRIDDEN by ${phoneSource}: "${phone}"`);
      }

      let address = '';
      for (const line of lines) {
        if (line.includes(',') && line !== name && line.length > 6 &&
            line.length < 120 && !line.includes('·') && !line.match(/^\d\.\d/) &&
            !line.match(/Open|Closed/i)) {
          address = line;
          break;
        }
      }

      // List cards rarely expose website links — absence here proves nothing,
      // so default to "Unknown" until enrichment confirms Yes/No.
      let website = '';
      let socialMedia = '';
      let hasOwnWebsite = 'Unknown';

      const allAnchors = card.querySelectorAll('a[href]');
      allAnchors.forEach(a => {
        const href = a.href || '';
        if (href && !href.includes('google.com/maps') && !href.startsWith('javascript')) {
          const isSocial = SOCIAL_DOMAINS.some(d => href.includes(d));
          if (isSocial) {
            socialMedia = href;
            console.log(`website anchor "${href}" → classified as SOCIAL`);
          } else {
            website = href;
            hasOwnWebsite = 'Yes';
            console.log(`website anchor "${href}" → classified as OWN WEBSITE`);
          }
        } else if (href) {
          console.log(`website anchor "${href}" → ignored (maps/javascript link)`);
        }
      });
      if (allAnchors.length === 0) console.log('website: no anchors in card → Unknown (enrichment will confirm)');

      console.log('final:', { phone, phoneSource: phoneSource || 'none', website, hasOwnWebsite, rating, reviews, category, address });
      console.groupEnd();

      results.push({
        "Business Name": name,
        "Category": category,
        "Rating": rating,
        "Reviews": reviews,
        "Phone": phone,
        "Email": "",
        "Address": address,
        "Website": website,
        "Has Own Website": hasOwnWebsite,
        "Social Media": socialMedia,
        "Maps URL": mapsURL,
        "Place ID": placeIdFrom(link.href)
      });
    } catch (e) {
      console.error('[Lead Gen] DOM parse error:', e);
    }
  });

  return results;
}

// One scroll round of the Maps results feed. Popup loops this for progress/cancel.
async function scrollStep() {
  const container =
    document.querySelector('div[role="feed"]') ||
    document.querySelector('.m6QErb.DxyBCb.kA9KIf.dS8AEf.ecceSd') ||
    document.querySelector('.ecceSd');

  if (!container) {
    return { error: 'Could not find results panel. Make sure search results are visible.' };
  }

  const before = container.scrollHeight;
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  await new Promise(r => setTimeout(r, 1800));

  // .HlvSq is the "end of the list" element — presence check is language-neutral.
  const atEnd = !!container.querySelector('.HlvSq');
  return {
    grew: container.scrollHeight > before,
    atEnd,
    count: document.querySelectorAll('a.hfpxzc').length
  };
}

function countMapListings() {
  return document.querySelectorAll('a.hfpxzc').length;
}

// Enrich ONE listing by index: click it, confirm navigation, read the detail panel.
// Self-contained — duplicated helpers are required (serialized injection).
async function enrichSingleListing(index) {
  const SOCIAL_DOMAINS = [
    'instagram.com', 'facebook.com', 'fb.com', 'twitter.com', 'x.com',
    'youtube.com', 'youtu.be', 'linkedin.com', 'tiktok.com', 'pinterest.com',
    'snapchat.com', 'threads.net', 'wa.me', 'whatsapp.com', 't.me',
    'telegram.me', 'reddit.com', 'tumblr.com'
  ];
  const countDigits = s => (String(s || '').match(/\d/g) || []).length;
  const isValidPhone = s => countDigits(s) >= 8 && countDigits(s) <= 15;
  const placeIdFrom = url => {
    const m = String(url || '').match(/1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
    return m ? m[1] : '';
  };
  const delay = ms => new Promise(r => setTimeout(r, ms));

  function readDetailPanel() {
    const titleEl = document.querySelector('h1.DUwDvf');
    const bName = titleEl ? titleEl.innerText.trim() : '';
    if (!bName) return null;

    // Multi-Layer Phone Extraction
    let phone = '';
    const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]') ||
                     document.querySelector('button.CsEnBe[aria-label^="Phone:"]') ||
                     document.querySelector('button[aria-label^="Phone:"]') ||
                     document.querySelector('button[aria-label*="Call"]') ||
                     document.querySelector('a[href^="tel:"]');

    if (phoneBtn) {
      const hrefVal = phoneBtn.getAttribute('href') || '';
      const dataId = phoneBtn.getAttribute('data-item-id') || '';
      const textDiv = phoneBtn.querySelector('.Io6YTe')?.innerText || '';
      const ariaLabel = phoneBtn.getAttribute('aria-label') || '';

      phone = hrefVal.replace('tel:', '').trim() ||
              dataId.replace('phone:tel:', '').trim() ||
              textDiv.trim() ||
              ariaLabel.replace(/^Phone:\s*/i, '').replace(/^Call\s*/i, '').trim();
    }

    if (!phone) {
      const csButtons = Array.from(document.querySelectorAll('.CsEnBe'));
      for (const btn of csButtons) {
        const aria = btn.getAttribute('aria-label') || '';
        const dataId = btn.getAttribute('data-item-id') || '';
        if (dataId.startsWith('phone:tel:') || aria.toLowerCase().includes('phone') || aria.toLowerCase().includes('call')) {
          phone = dataId.replace('phone:tel:', '').trim() ||
                  btn.querySelector('.Io6YTe')?.innerText ||
                  aria.replace(/^Phone:\s*/i, '').replace(/^Call\s*/i, '').trim();
          if (phone) break;
        }
      }
    }

    if (!phone) {
      const panel = document.querySelector('div[role="main"]') || document.querySelector('.m6QErb');
      const mainText = panel ? panel.innerText : '';
      const candidates = mainText.match(/\+?\d[\d\s\-().]{6,18}\d/g) || [];
      for (const c of candidates) {
        if (isValidPhone(c)) {
          phone = c.trim();
          console.log(`[LeadMachine] panel-text phone fallback ACCEPTED: "${c}"`);
          break;
        }
        console.log(`[LeadMachine] panel-text phone fallback rejected: "${c}" (need 8-15 digits)`);
      }
    }

    // Address Extraction
    let address = '';
    const addressBtn = document.querySelector('button[data-item-id="address"]') ||
                       document.querySelector('button.CsEnBe[aria-label^="Address:"]') ||
                       document.querySelector('button[aria-label^="Address:"]');

    if (addressBtn) {
      const textDiv = addressBtn.querySelector('.Io6YTe')?.innerText || '';
      const ariaLabel = addressBtn.getAttribute('aria-label') || '';
      address = textDiv.trim() || ariaLabel.replace(/^Address:\s*/i, '').trim();
    }

    if (!address) {
      const addressBtns = Array.from(document.querySelectorAll('.CsEnBe'));
      for (const btn of addressBtns) {
        const label = btn.getAttribute('aria-label') || '';
        const dataId = btn.getAttribute('data-item-id') || '';
        if (dataId === 'address' || label.toLowerCase().includes('address')) {
          address = (btn.querySelector('.Io6YTe')?.innerText || label.replace(/^Address:\s*/i, '')).trim();
          break;
        }
      }
    }

    // Website & Social Media — detail panel is authoritative (Yes/No, never Unknown)
    let website = '';
    let socialMedia = '';
    let hasOwnWebsite = 'No';

    const websiteEl = document.querySelector('a[data-item-id="authority"]') ||
                      document.querySelector('a.CsEnBe[aria-label^="Website:"]') ||
                      document.querySelector('a[aria-label^="Website:"]');

    if (websiteEl && websiteEl.href) {
      const raw = websiteEl.href;
      const isSocial = SOCIAL_DOMAINS.some(d => raw.includes(d));
      if (isSocial) {
        socialMedia = raw;
      } else {
        website = raw;
        hasOwnWebsite = 'Yes';
      }
    }

    const panel = document.querySelector('div[role="main"]') || document.querySelector('.m6QErb');
    if (panel && !socialMedia) {
      const anchors = Array.from(panel.querySelectorAll('a[href]')).map(a => a.href);
      const foundSocial = anchors.find(hrefVal => SOCIAL_DOMAINS.some(d => hrefVal.includes(d)));
      if (foundSocial) socialMedia = foundSocial;
    }

    let rating = '';
    const ratingEl = document.querySelector('div.F7nice > span > span[aria-hidden="true"]') ||
                     document.querySelector('span.MW4etd');
    if (ratingEl) rating = ratingEl.innerText.trim();

    let reviews = '';
    const reviewEl = document.querySelector('div.F7nice span[role="img"]') ||
                     document.querySelector('span.UY7F9');
    if (reviewEl) {
      const aria = reviewEl.getAttribute('aria-label') || '';
      const m = aria.match(/([\d,.]+)/);
      if (m) {
        reviews = m[1].replace(/[,.]/g, '');
      } else {
        reviews = reviewEl.innerText.replace(/[(),\s]/g, '').trim();
      }
    }

    let category = '';
    const catEl = document.querySelector('button[jsaction*="category"]') ||
                  document.querySelector('.DkV0ie');
    if (catEl) category = catEl.innerText.trim();

    return {
      "Business Name": bName,
      "Category": category,
      "Rating": rating,
      "Reviews": reviews,
      "Phone": phone,
      "Email": "",
      "Address": address,
      "Website": website,
      "Has Own Website": hasOwnWebsite,
      "Social Media": socialMedia,
      "Maps URL": window.location.href.split('?')[0],
      "Place ID": placeIdFrom(window.location.href)
    };
  }

  const links = document.querySelectorAll('a.hfpxzc');

  // Single-place page (no result list) — read the open detail panel directly.
  if (links.length === 0) {
    const record = readDetailPanel();
    return record ? { status: 'ok', record } : { status: 'nav-failed', name: '' };
  }

  const link = links[index];
  if (!link) return { status: 'done' };

  const targetName = link.getAttribute('aria-label') || '';
  if (!targetName) return { status: 'nav-failed', name: '' };

  const targetId = placeIdFrom(link.getAttribute('href') || '');

  link.scrollIntoView({ block: 'center' });
  const card = link.closest('.Nv2PK') || link.parentElement;
  const clickTarget = card ? (card.querySelector('.qBF1Pd') || link) : link;

  const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  events.forEach(evt => {
    clickTarget.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
    link.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
  });

  // Navigation confirmation: place ID match (authoritative), or a STRONG title
  // match — at least 60% of the target's name tokens. A single shared token
  // like "gym" is not enough; that mis-attributed data to the wrong business.
  const cleanWords = str => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const norm = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetTokens = cleanWords(targetName);
  const neededTokens = Math.max(1, Math.ceil(targetTokens.length * 0.6));

  let isNavigated = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    await delay(200);

    if (targetId && window.location.href.includes(targetId)) {
      isNavigated = true;
      break;
    }

    const currentTitle = document.querySelector('h1.DUwDvf')?.innerText.trim() || '';
    if (!currentTitle) continue;

    if (targetTokens.length > 0) {
      const currentTokens = cleanWords(currentTitle);
      const matched = targetTokens.filter(t => currentTokens.includes(t)).length;
      if (matched >= neededTokens) {
        isNavigated = true;
        break;
      }
    } else if (norm(targetName) && norm(currentTitle).includes(norm(targetName))) {
      // Name is all short tokens (e.g. "A 2 Z") — fall back to substring match.
      isNavigated = true;
      break;
    }
  }

  if (!isNavigated) {
    // Do NOT scrape the panel — it still shows the previous listing.
    console.log(`[LeadMachine] enrich #${index} "${targetName}": NAV FAILED (panel title never matched, placeId=${targetId || 'none'}) — skipped`);
    return { status: 'nav-failed', name: targetName };
  }

  await delay(300);

  const record = readDetailPanel();
  if (!record) {
    console.log(`[LeadMachine] enrich #${index} "${targetName}": navigated but no detail panel title found — skipped`);
    return { status: 'nav-failed', name: targetName };
  }

  if (!record["Place ID"] && targetId) record["Place ID"] = targetId;
  if (!record["Maps URL"].includes('/place/')) record["Maps URL"] = (link.href || '').split('?')[0];

  console.log(`[LeadMachine] enrich #${index} "${targetName}": OK →`, {
    phone: record.Phone, website: record.Website, hasOwnWebsite: record["Has Own Website"],
    social: record["Social Media"], address: record.Address
  });
  return { status: 'ok', record };
}
