/**
 * Maps & Search Lead Generator — Master Lead Suite (v7.3 PRO for Edge & Chrome)
 *
 * Developed by JSP Coders
 * Fine-Tuned Regex Engine:
 * 1. Strict single-line Phone Regex: Prevents matching across newlines (\n).
 * 2. Optimized Indian & International Phone Number Extraction.
 * 3. Clean Regex character sets [0-9 \-.()] to eliminate unneeded escapes.
 */

let allLeads = [];
let currentFilter = 'all';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  const scrapeBtn      = document.getElementById('scrapeBtn');
  const scrollBtn      = document.getElementById('scrollBtn');
  const enrichBtn      = document.getElementById('enrichBtn');
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

  function showAlert(msg, type = 'info') {
    alertBox.textContent = msg;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 5000);
  }

  function getFilteredLeads() {
    return allLeads.filter(l => {
      // Filter type
      if (currentFilter === 'hot' && !l["Sales Angle"].includes('Hot')) return false;
      if (currentFilter === 'phone' && (!l.Phone || l.Phone.length < 4)) return false;
      if (currentFilter === 'noweb' && l["Has Own Website"] !== "No") return false;

      // Deep Text Search
      if (searchQuery) {
        const text = `${l["Business Name"]} ${l.Category} ${l.Address} ${l.Phone} ${l.Website} ${l["Sales Angle"]} ${l["Maps URL"]}`.toLowerCase();
        if (!text.includes(searchQuery)) return false;
      }
      return true;
    });
  }

  function updateStats() {
    leadCount.textContent = allLeads.length;
    phoneCount.textContent = allLeads.filter(l => l.Phone && l.Phone.length > 3).length;
    hotCount.textContent = allLeads.filter(l => l["Sales Angle"] && l["Sales Angle"].includes('Hot')).length;
    
    const hasLeads = allLeads.length > 0;
    exportXlsxBtn.disabled = !hasLeads;
    exportCsvBtn.disabled  = !hasLeads;
    if (exportVcfBtn) exportVcfBtn.disabled = !hasLeads;
    enrichBtn.disabled     = !hasLeads;

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
  }

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

  // ═══════════════════════════════════════════════════════════════════════
  //  1. SCRAPE BUTTON
  // ═══════════════════════════════════════════════════════════════════════
  scrapeBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) {
      showAlert('Please open Google Maps or Google Search tab first!', 'error');
      return;
    }

    scrapeBtn.disabled = true;
    scrapeBtn.textContent = '⏳ Scraping...';
    statusText.textContent = 'Extracting leads with AI Sales Intelligence...';

    try {
      const isMaps = tab.url.includes('google.com/maps');
      const scrapeFunc = isMaps ? scrapeVisibleListings : scrapeGoogleSearchPage;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeFunc
      });

      const data = results[0]?.result || [];

      if (data.length === 0) {
        showAlert('No leads found. Make sure search results are visible.', 'error');
        statusText.textContent = 'No listings found. Try searching first.';
      } else {
        const existingNames = new Set(allLeads.map(l => l["Business Name"].toLowerCase().trim()));

        let newCount = 0;
        for (const item of data) {
          const itemName = (item["Business Name"] || '').toLowerCase().trim();
          if (itemName && !existingNames.has(itemName)) {
            item["WhatsApp Link"] = generateWhatsAppLink(item.Phone, item["Business Name"]);
            item["Sales Angle"] = analyzeSalesOpportunity(item);
            item["Instagram Search"] = `https://www.google.com/search?q=site:instagram.com+"${encodeURIComponent(item["Business Name"])}"`;
            item["Facebook Search"] = `https://www.google.com/search?q=site:facebook.com+"${encodeURIComponent(item["Business Name"])}"`;

            allLeads.push(item);
            existingNames.add(itemName);
            newCount++;
          }
        }

        const withPhone = allLeads.filter(l => l.Phone && l.Phone.length > 3).length;
        const hots = allLeads.filter(l => l["Sales Angle"].includes('Hot')).length;

        showAlert(`Scraped ${data.length} leads (${newCount} new, ${hots} Hot Deals)!`, 'success');
      }

      updateStats();
    } catch (e) {
      console.error(e);
      showAlert('Scrape error: ' + e.message, 'error');
    }

    scrapeBtn.disabled = false;
    scrapeBtn.textContent = '⚡ Scrape This Page';
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  2. SCROLL BUTTON
  // ═══════════════════════════════════════════════════════════════════════
  scrollBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) {
      showAlert('Please open Google Maps tab first!', 'error');
      return;
    }

    scrollBtn.disabled = true;
    scrollBtn.textContent = '📜 Scrolling...';
    statusText.textContent = 'Scrolling results panel...';

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrollResultsPanel
      });

      const msg = results[0]?.result || 'Done';
      statusText.textContent = msg + ' — Now click "Scrape This Page".';
      showAlert(msg, 'info');
    } catch (e) {
      console.error(e);
      showAlert('Scroll error: ' + e.message, 'error');
    }

    scrollBtn.disabled = false;
    scrollBtn.textContent = '📜 Scroll & Load More';
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  3. ENRICH BUTTON
  // ═══════════════════════════════════════════════════════════════════════
  enrichBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) {
      showAlert('Please open Google Maps tab first!', 'error');
      return;
    }

    enrichBtn.disabled = true;
    enrichBtn.textContent = '📞 Fetching Details...';
    statusText.textContent = 'Navigating listings to extract Phone, Address & Socials...';

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: enrichListings
      });

      const enrichedData = results[0]?.result || [];

      if (enrichedData.length > 0) {
        const nameMap = new Map();

        enrichedData.forEach(item => {
          if (item["Business Name"]) {
            const key = item["Business Name"].toLowerCase().replace(/[^a-z0-9]/g, '');
            nameMap.set(key, item);
          }
        });

        allLeads = allLeads.map(lead => {
          const leadKey = (lead["Business Name"] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const fresh = nameMap.get(leadKey);

          if (fresh) {
            const updated = {
              ...lead,
              Phone: fresh.Phone || lead.Phone || '',
              Address: fresh.Address || lead.Address || '',
              Website: fresh.Website || lead.Website || '',
              "Has Own Website": fresh["Has Own Website"] || lead["Has Own Website"] || 'No',
              "Social Media": fresh["Social Media"] || lead["Social Media"] || '',
              Rating: fresh.Rating || lead.Rating || '',
              Reviews: fresh.Reviews || lead.Reviews || '',
              Category: fresh.Category || lead.Category || '',
              "Maps URL": fresh["Maps URL"] || lead["Maps URL"] || ''
            };
            updated["WhatsApp Link"] = generateWhatsAppLink(updated.Phone, updated["Business Name"]);
            updated["Sales Angle"] = analyzeSalesOpportunity(updated);
            updated["Instagram Search"] = `https://www.google.com/search?q=site:instagram.com+"${encodeURIComponent(updated["Business Name"])}"`;
            updated["Facebook Search"] = `https://www.google.com/search?q=site:facebook.com+"${encodeURIComponent(updated["Business Name"])}"`;
            return updated;
          }
          return lead;
        });

        const withPhone = allLeads.filter(l => l.Phone && l.Phone.length > 3).length;
        const hots = allLeads.filter(l => l["Sales Angle"].includes('Hot')).length;

        showAlert(`Fetched ${withPhone} Phone Numbers (${hots} Hot Deals)!`, 'success');
      } else {
        showAlert('No additional details found.', 'info');
      }

      updateStats();
    } catch (e) {
      console.error(e);
      showAlert('Enrichment error: ' + e.message, 'error');
    }

    enrichBtn.disabled = false;
    enrichBtn.textContent = '📞 Fetch Phone & Details';
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  4. EXPORT EXCEL (.xlsx)
  // ═══════════════════════════════════════════════════════════════════════
  exportXlsxBtn.addEventListener('click', () => {
    let listToExport = getFilteredLeads();
    if (listToExport.length === 0 && allLeads.length > 0) {
      listToExport = allLeads;
      showAlert(`Search filter produced 0 matches. Exported all ${allLeads.length} leads!`, 'info');
    } else if (listToExport.length === 0) {
      return;
    }

    try {
      const worksheet = XLSX.utils.json_to_sheet(listToExport);

      worksheet['!cols'] = [
        { wch: 32 }, // Sales Angle / Pitch Tag
        { wch: 32 }, // Business Name
        { wch: 18 }, // Phone
        { wch: 45 }, // WhatsApp Link
        { wch: 45 }, // Address
        { wch: 30 }, // Website
        { wch: 16 }, // Has Own Website
        { wch: 20 }, // Category
        { wch: 10 }, // Rating
        { wch: 10 }, // Reviews
        { wch: 35 }, // Instagram Search
        { wch: 35 }, // Facebook Search
        { wch: 30 }, // Social Media
        { wch: 35 }  // Maps URL
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "JSP Coders Master Leads");

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `jsp_coders_leads_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, filename);
      showAlert(`Exported ${listToExport.length} leads to ${filename}!`, 'success');
    } catch (err) {
      console.error('XLSX Export Error:', err);
      showAlert('Export error: ' + err.message, 'error');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  5. EXPORT CSV (.csv)
  // ═══════════════════════════════════════════════════════════════════════
  exportCsvBtn.addEventListener('click', () => {
    let listToExport = getFilteredLeads();
    if (listToExport.length === 0 && allLeads.length > 0) {
      listToExport = allLeads;
      showAlert(`Search filter produced 0 matches. Exported all ${allLeads.length} leads!`, 'info');
    } else if (listToExport.length === 0) {
      return;
    }

    try {
      const worksheet = XLSX.utils.json_to_sheet(listToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "JSP Coders Master Leads");

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `jsp_coders_leads_${dateStr}.csv`;

      XLSX.writeFile(workbook, filename, { bookType: 'csv' });
      showAlert(`Exported ${listToExport.length} leads to ${filename}!`, 'success');
    } catch (err) {
      console.error('CSV Export Error:', err);
      showAlert('Export error: ' + err.message, 'error');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  6. EXPORT PHONE CONTACTS (.vcf / vCard)
  // ═══════════════════════════════════════════════════════════════════════
  if (exportVcfBtn) {
    exportVcfBtn.addEventListener('click', () => {
      let listToExport = getFilteredLeads().filter(l => l.Phone && l.Phone.length > 3);
      if (listToExport.length === 0 && allLeads.length > 0) {
        listToExport = allLeads.filter(l => l.Phone && l.Phone.length > 3);
      }

      if (listToExport.length === 0) {
        showAlert('No leads with phone numbers to export.', 'error');
        return;
      }

      let vcfContent = '';
      listToExport.forEach(lead => {
        const cleanPhone = lead.Phone.replace(/\D/g, '');
        vcfContent += `BEGIN:VCARD\r\n`;
        vcfContent += `VERSION:3.0\r\n`;
        vcfContent += `FN:${lead["Business Name"]}\r\n`;
        vcfContent += `TEL;TYPE=CELL:${cleanPhone}\r\n`;
        if (lead.Address) vcfContent += `ADR;TYPE=WORK:;;${lead.Address};;;;\r\n`;
        if (lead.Website) vcfContent += `URL:${lead.Website}\r\n`;
        vcfContent += `NOTE:${lead["Sales Angle"]} | Category: ${lead.Category}\r\n`;
        vcfContent += `END:VCARD\r\n`;
      });

      const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `jsp_coders_contacts_${dateStr}.vcf`;
      link.click();
      URL.revokeObjectURL(url);

      showAlert(`Exported ${listToExport.length} phone contacts to .vcf file!`, 'success');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  7. CLEAR BUTTON
  // ═══════════════════════════════════════════════════════════════════════
  clearBtn.addEventListener('click', () => {
    allLeads = [];
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    currentFilter = 'all';
    chips.forEach(c => c.classList.remove('active'));
    if (chips[0]) chips[0].classList.add('active');
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';

    updateStats();
    statusText.textContent = 'Data cleared. Ready for fresh scraping.';
  });

  function generateWhatsAppLink(phone, name) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return '';

    let formattedPhone = digits;
    if (digits.length === 10) {
      formattedPhone = '91' + digits;
    }

    const message = encodeURIComponent(`Hello ${name}, I found your listing and would love to share a special proposal!`);
    return `https://wa.me/${formattedPhone}?text=${message}`;
  }

  function analyzeSalesOpportunity(item) {
    const hasPhone = item.Phone && item.Phone.length > 3;
    const hasNoWebsite = item["Has Own Website"] === "No";
    const ratingNum = parseFloat(item.Rating) || 0;
    const reviewNum = parseInt(item.Reviews, 10) || 0;

    if (hasPhone && hasNoWebsite && reviewNum >= 30) {
      return '🔥 Hot Web Design Deal ($1,000+ High Income & No Web)';
    } else if (hasPhone && hasNoWebsite) {
      return '🔥 Hot Lead (No Website - Pitch Web Creation)';
    } else if (hasPhone && ratingNum > 0 && ratingNum < 4.2) {
      return '⭐ Review Pitch (Rating Below 4.2 - Pitch Reputation)';
    } else if (hasPhone) {
      return '⚡ Warm Lead (Direct Sales Target)';
    } else {
      return '❄️ Prospect';
    }
  }
});


// ═══════════════════════════════════════════════════════════════════════════
//  INJECTED FUNCTIONS (Runs inside Google Maps & Google Search DOM)
// ═══════════════════════════════════════════════════════════════════════════

function scrapeGoogleSearchPage() {
  const results = [];
  const searchBlocks = document.querySelectorAll('div.g, div.MjjYud');

  searchBlocks.forEach(block => {
    try {
      const titleEl = block.querySelector('h3');
      if (!titleEl) return;

      const name = titleEl.innerText.trim();
      const linkEl = block.querySelector('a');
      const href = linkEl ? linkEl.href : '';
      const snippetEl = block.querySelector('div.VwiC3b, div.IsZvec');
      const text = snippetEl ? snippetEl.innerText : block.innerText;

      let phone = '';
      // Strict single-line phone regex (does not cross newlines)
      const phoneMatch = text.match(/(\+?\d{1,3}[ -]?)?\(?\d{2,5}\)?[ -]?\d{3,5}[ -]?\d{3,5}/);
      if (phoneMatch && phoneMatch[0].length >= 8) phone = phoneMatch[0].trim();

      let email = '';
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) email = emailMatch[0];

      let website = href && !href.includes('google.com') ? href : '';
      let hasOwnWebsite = website ? 'Yes' : 'No';

      results.push({
        "Business Name": name,
        "Category": "Google Search Lead",
        "Rating": "",
        "Reviews": "",
        "Phone": phone,
        "Address": "",
        "Website": website,
        "Has Own Website": hasOwnWebsite,
        "Social Media": email ? `Email: ${email}` : '',
        "Maps URL": href
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
      const m = mainText.match(/(\+?\d{1,4}[-.\s]?)?(\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}/);
      if (m && m[0].length >= 7 && !m[0].includes('202') && !m[0].includes('201')) {
        phone = m[0].trim();
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

    let rating = '';
    const ratingEl = document.querySelector('div.F7nice > span > span[aria-hidden="true"]') ||
                     document.querySelector('span.MW4etd');
    if (ratingEl) rating = ratingEl.innerText.trim();

    let reviews = '';
    const reviewEl = document.querySelector('div.F7nice span[role="img"][aria-label*="reviews"]') ||
                     document.querySelector('span.UY7F9');
    if (reviewEl) {
      const aria = reviewEl.getAttribute('aria-label') || '';
      const m = aria.match(/([\d,]+)\s*reviews/i);
      if (m) {
        reviews = m[1].replace(/,/g, '');
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
      "Address": address,
      "Website": website,
      "Has Own Website": hasOwnWebsite,
      "Social Media": socialMedia,
      "Maps URL": window.location.href.split('?')[0]
    };
  }

  const results = [];
  const links = document.querySelectorAll('a.hfpxzc');

  if (links.length === 0) {
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
            !line.match(/^\+?\d[0-9 \-.()]{6,}/)) {
          category = line;
          break;
        }
      }

      let phone = '';
      // Strict single-line phone match on card text
      const phoneMatch = cardText.match(/(\+?\d{1,3}[ -]?)?\(?\d{2,5}\)?[ -]?\d{3,5}[ -]?\d{3,5}/);
      if (phoneMatch && phoneMatch[0].length >= 8) phone = phoneMatch[0].trim();

      const phoneBtn = card.querySelector('button[aria-label*="Call"]') || card.querySelector('a[href^="tel:"]');
      if (phoneBtn) {
        const href = phoneBtn.getAttribute('href') || '';
        const aria = phoneBtn.getAttribute('aria-label') || '';
        if (href.startsWith('tel:')) phone = href.replace('tel:', '').trim();
        else if (aria) phone = aria.replace(/^Call\s*/i, '').replace(/^Phone:\s*/i, '').trim();
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

      let website = '';
      let socialMedia = '';
      let hasOwnWebsite = 'No';

      const allAnchors = card.querySelectorAll('a[href]');
      allAnchors.forEach(a => {
        const href = a.href || '';
        if (href && !href.includes('google.com/maps') && !href.startsWith('javascript')) {
          const isSocial = SOCIAL_DOMAINS.some(d => href.includes(d));
          if (isSocial) {
            socialMedia = href;
          } else {
            website = href;
            hasOwnWebsite = 'Yes';
          }
        }
      });

      results.push({
        "Business Name": name,
        "Category": category,
        "Rating": rating,
        "Reviews": reviews,
        "Phone": phone,
        "Address": address,
        "Website": website,
        "Has Own Website": hasOwnWebsite,
        "Social Media": socialMedia,
        "Maps URL": mapsURL
      });
    } catch (e) {
      console.error('[Lead Gen] DOM parse error:', e);
    }
  });

  return results;
}

async function scrollResultsPanel() {
  const container =
    document.querySelector('div[role="feed"]') ||
    document.querySelector('.m6QErb.DxyBCb.kA9KIf.dS8AEf.ecceSd') ||
    document.querySelector('.ecceSd');

  if (!container) {
    return 'Could not find results panel. Make sure search results are visible.';
  }

  const scrollTimes = 6;
  let previousHeight = container.scrollHeight;

  for (let i = 0; i < scrollTimes; i++) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 1800));

    previousHeight = container.scrollHeight;
    const endMsg = container.querySelector('.HlvSq');
    if (endMsg && endMsg.textContent && endMsg.textContent.includes('end of the list')) {
      return `Reached end of list after ${i + 1} scrolls.`;
    }
  }

  const totalLinks = document.querySelectorAll('a.hfpxzc').length;
  return `Scrolled ${scrollTimes} times. ${totalLinks} listings now visible.`;
}

async function enrichListings() {
  const SOCIAL_DOMAINS = [
    'instagram.com', 'facebook.com', 'fb.com', 'twitter.com', 'x.com',
    'youtube.com', 'youtu.be', 'linkedin.com', 'tiktok.com', 'pinterest.com',
    'snapchat.com', 'threads.net', 'wa.me', 'whatsapp.com', 't.me',
    'telegram.me', 'reddit.com', 'tumblr.com'
  ];

  const links = Array.from(document.querySelectorAll('a.hfpxzc'));
  const enriched = [];
  const delay = ms => new Promise(r => setTimeout(r, ms));

  if (links.length === 0) {
    const singlePlace = scrapeVisibleListings()[0];
    if (singlePlace) enriched.push(singlePlace);
    return enriched;
  }

  for (let i = 0; i < Math.min(links.length, 50); i++) {
    const link = links[i];
    const targetName = link.getAttribute('aria-label') || '';
    const href = link.getAttribute('href') || '';
    if (!targetName) continue;

    const idMatch = href.match(/1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
    const targetId = idMatch ? idMatch[1] : '';

    link.scrollIntoView({ block: 'center' });
    const card = link.closest('.Nv2PK') || link.parentElement;
    const clickTarget = card ? (card.querySelector('.qBF1Pd') || link) : link;

    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    events.forEach(evt => {
      clickTarget.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
      link.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
    });

    const cleanWords = str => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const targetTokens = cleanWords(targetName);

    let isNavigated = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      await delay(200);

      if (targetId && window.location.href.includes(targetId)) {
        isNavigated = true;
        break;
      }

      const currentTitle = document.querySelector('h1.DUwDvf')?.innerText.trim() || '';
      const currentTokens = cleanWords(currentTitle);

      const hasCommonToken = targetTokens.some(t => currentTokens.includes(t));
      if (hasCommonToken) {
        isNavigated = true;
        break;
      }
    }

    await delay(300);

    const titleEl = document.querySelector('h1.DUwDvf');
    const bName = titleEl ? titleEl.innerText.trim() : targetName;

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
      const m = mainText.match(/(\+?\d{1,4}[-.\s]?)?(\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}/);
      if (m && m[0].length >= 7 && !m[0].includes('202') && !m[0].includes('201')) {
        phone = m[0].trim();
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
        if (label.toLowerCase().includes('address')) {
          address = (btn.querySelector('.Io6YTe')?.innerText || label.replace(/^Address:\s*/i, '')).trim();
          break;
        }
      }
    }

    // Website & Social Media
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
    if (panel) {
      const anchors = Array.from(panel.querySelectorAll('a[href]')).map(a => a.href);
      const foundSocial = anchors.find(hrefVal => SOCIAL_DOMAINS.some(d => hrefVal.includes(d)));
      if (foundSocial) socialMedia = foundSocial;
    }

    let rating = '';
    const ratingEl = document.querySelector('div.F7nice > span > span[aria-hidden="true"]') ||
                     document.querySelector('span.MW4etd');
    if (ratingEl) rating = ratingEl.innerText.trim();

    let reviews = '';
    const reviewEl = document.querySelector('div.F7nice span[role="img"][aria-label*="reviews"]') ||
                     document.querySelector('span.UY7F9');
    if (reviewEl) {
      const aria = reviewEl.getAttribute('aria-label') || '';
      const m = aria.match(/([\d,]+)\s*reviews/i);
      if (m) {
        reviews = m[1].replace(/,/g, '');
      } else {
        reviews = reviewEl.innerText.replace(/[(),\s]/g, '').trim();
      }
    }

    let category = '';
    const catEl = document.querySelector('button[jsaction*="category"]') ||
                  document.querySelector('.DkV0ie');
    if (catEl) category = catEl.innerText.trim();

    const currentUrl = window.location.href.includes('/place/') ? window.location.href.split('?')[0] : (link.href || '').split('?')[0];

    enriched.push({
      "Business Name": bName,
      "Category": category,
      "Rating": rating,
      "Reviews": reviews,
      "Phone": phone,
      "Address": address,
      "Website": website,
      "Has Own Website": hasOwnWebsite,
      "Social Media": socialMedia,
      "Maps URL": currentUrl
    });
  }

  return enriched;
}
