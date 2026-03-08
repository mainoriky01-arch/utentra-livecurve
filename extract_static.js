#!/usr/bin/env node
/**
 * extract_static.js - Extract STATIC pressure polylines from LiveCurve
 * Connects to existing Chrome via CDP at port 18800
 * Run: node extract_static.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, 'index.html');
const RESULTS_FILE = path.join(__dirname, 'static_curves_data.json');
const CDP_URL = 'http://127.0.0.1:18800';

// Series navigation map: seriesKey → [categoryHref, subgroupText|null, seriesLinkText]
// Based on actual LiveCurve site structure
const SERIES_NAV = {
  // High Pressure > AP > series
  'APE':   ['#collapse-7', 'AP',   'APE'],
  'APF':   ['#collapse-7', 'AP',   'APF'],
  'APG':   ['#collapse-7', 'AP',   'APG'],
  // High Pressure > APc > series
  'APEc':  ['#collapse-7', 'APc',  'APEc'],
  // High Pressure > APR > series
  'APRF':  ['#collapse-7', 'APR',  'APRF'],
  'APRG':  ['#collapse-7', 'APR',  'APRG'],
  'APRH':  ['#collapse-7', 'APR',  'APRH'],
  'APRI':  ['#collapse-7', 'APR',  'APRI'],
  'APRL':  ['#collapse-7', 'APR',  'APRL'],
  // High Pressure > APRD > series
  'APRED': ['#collapse-7', 'APRD', 'APRED'],
  'APRFD': ['#collapse-7', 'APRD', 'APRFD'],
  'APRGD': ['#collapse-7', 'APRD', 'APRGD'],
  // Medium Pressure (direct, no subgroup)
  'EU':    ['#collapse-8', null,   'EU'],
  'EUK':   ['#collapse-8', null,   'EUK'],
  'EUM':   ['#collapse-8', null,   'EUM'],
  'MPR':   ['#collapse-8', null,   'MPR'],
  'TF':    ['#collapse-8', null,   'TF'],
  'TH':    ['#collapse-8', null,   'TH'],
  'TPA':   ['#collapse-8', null,   'TPA'],
  'TQ':    ['#collapse-8', null,   'TQ'],
  'TR':    ['#collapse-8', null,   'TR'],
  // Low Pressure (direct, no subgroup)
  'BP':    ['#collapse-9', null,   'BP'],
  'BPR':   ['#collapse-9', null,   'BPR'],
  'BT':    ['#collapse-9', null,   'BT'],
  // Low p. Axials (direct)
  'EVF':   ['#collapse-6', null,   'EVF'],
  'EVL':   ['#collapse-6', null,   'EVL'],
  'EVP':   ['#collapse-6', null,   'EVP'],
  'EVT':   ['#collapse-6', null,   'EVT'],
};

function parseModels(html) {
  const models = [];
  const regex = /"([A-Z][A-Za-z0-9]+ [0-9]+\/[A-Za-z0-9]+)": \{([^}]+)\}/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const name = m[1];
    const data = m[2];
    if (data.includes('static:')) continue;
    const series = name.split(' ')[0];
    models.push({ name, series });
  }
  return models;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForStaticPolyline(page, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await page.evaluate(() => {
      try {
        const iframe = document.getElementById('livecurve');
        if (!iframe) return null;
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc) return null;
        const svg = doc.getElementById('chart-aeraulicCharacteristic');
        if (!svg) return null;
        const lines = svg.querySelectorAll('polyline');
        if (lines.length < 2) return null;
        const pts = lines[1].getAttribute('points');
        return (pts && pts.trim()) ? pts.trim() : null;
      } catch(e) { return null; }
    });
    if (result) return result;
    await sleep(350);
  }
  return null;
}

async function clickLiveCurveTab(page) {
  await page.evaluate(() => {
    const all = document.querySelectorAll('a');
    const tab = Array.from(all).find(l => l.textContent.trim() === 'LiveCurve');
    if (tab) tab.click();
  });
  await sleep(500);
}

async function navigateToSeries(page, seriesKey) {
  const nav = SERIES_NAV[seriesKey];
  if (!nav) throw new Error(`No nav entry for: ${seriesKey}`);
  const [catHref, groupText, seriesText] = nav;

  // Expand category
  await page.evaluate((href) => {
    const el = document.querySelector(`a[href="${href}"]`);
    if (el) el.click();
  }, catHref);
  await sleep(350);

  // Expand subgroup if needed
  if (groupText) {
    await page.evaluate((gt) => {
      const all = document.querySelectorAll('a');
      const el = Array.from(all).find(l => l.textContent.trim().startsWith(gt) && 
        l.getAttribute('href') && l.getAttribute('href').startsWith('#collapse'));
      if (el) el.click();
    }, groupText);
    await sleep(350);
  }

  // Click series
  const ok = await page.evaluate((st) => {
    const all = document.querySelectorAll('a');
    const el = Array.from(all).find(l => l.textContent.trim() === st && 
      l.getAttribute('href') === '#fan-detail');
    if (el) { el.click(); return true; }
    // Fallback: any link with exact text
    const el2 = Array.from(all).find(l => l.textContent.trim() === st);
    if (el2) { el2.click(); return true; }
    return false;
  }, seriesText);

  if (!ok) throw new Error(`Series link not found: ${seriesText}`);
  await sleep(700);
}

async function selectModel(page, modelName) {
  return page.evaluate((name) => {
    const sel = document.querySelector('select');
    if (!sel) return false;
    const opt = Array.from(sel.options).find(o => o.text.trim() === name);
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, modelName);
}

function roundPoints(pts) {
  return pts.split(' ').map(p => {
    const [x, y] = p.split(',').map(Number);
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
  }).join(' ');
}

function updateIndexHtml(results) {
  let html = fs.readFileSync(HTML_FILE, 'utf8');
  let updated = 0;

  for (const [name, pts] of Object.entries(results)) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Insert ,static:"..." after total:"..."  and before ,area: or }
    const re = new RegExp(`("${esc}": \\{[^}]*?total:"[^"]*")(,area:|\\})`, 'g');
    const before = html;
    html = html.replace(re, (m, p1, p2) => {
      if (p1.includes('static:')) return m;
      return `${p1},static:"${pts}"${p2}`;
    });
    if (html !== before) updated++;
  }

  fs.writeFileSync(HTML_FILE, html);
  console.log(`\nindex.html: ${updated} models updated`);
}

async function main() {
  // Load progress
  let results = {};
  if (fs.existsSync(RESULTS_FILE)) {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    console.log(`Progress: ${Object.keys(results).length} already extracted`);
  }

  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const allModels = parseModels(html);
  const toProcess = allModels.filter(m => !results[m.name]);
  console.log(`Remaining: ${toProcess.length}/${allModels.length}`);

  if (toProcess.length === 0) {
    console.log('All done! Updating HTML...');
    updateIndexHtml(results);
    return;
  }

  // Connect to Chrome
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  let page = pages.find(p => p.url().includes('livecurve.euroventilatori')) || pages[0];
  if (!page) {
    page = await ctx.newPage();
    await page.goto('https://livecurve.euroventilatori-int.com/en/industrial-fans/');
    await sleep(2000);
  }

  // Group by series
  const bySeries = {};
  for (const m of toProcess) {
    if (!bySeries[m.series]) bySeries[m.series] = [];
    bySeries[m.series].push(m.name);
  }

  let extracted = 0;
  const errors = [];

  for (const [series, models] of Object.entries(bySeries)) {
    console.log(`\n=== ${series} (${models.length}) ===`);

    try {
      await navigateToSeries(page, series);
    } catch(e) {
      console.log(`  Nav failed: ${e.message}`);
      errors.push(`NAV:${series}: ${e.message}`);
      continue;
    }

    // Open LiveCurve tab
    await clickLiveCurveTab(page);
    await sleep(600);

    for (let i = 0; i < models.length; i++) {
      const name = models[i];
      process.stdout.write(`  [${i+1}/${models.length}] ${name}... `);

      try {
        const ok = await selectModel(page, name);
        if (!ok) {
          console.log('SKIP (not in dropdown)');
          errors.push(`${name}: not in dropdown`);
          continue;
        }
        await sleep(600);
        await clickLiveCurveTab(page);

        const pts = await waitForStaticPolyline(page, 12000);
        if (pts) {
          results[name] = roundPoints(pts);
          extracted++;
          console.log(`OK (${pts.split(' ').length}pts)`);
        } else {
          console.log('FAIL (timeout)');
          errors.push(`${name}: timeout`);
        }

        // Periodic saves
        if (extracted % 10 === 0) fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        if (extracted % 25 === 0) {
          console.log(`\n[CHECKPOINT] extracted=${extracted} errors=${errors.length}\n`);
        }

      } catch(e) {
        console.log(`ERROR: ${e.message}`);
        errors.push(`${name}: ${e.message}`);
        // Recovery
        try { await navigateToSeries(page, series); await clickLiveCurveTab(page); await sleep(600); } catch(_) {}
      }

      await sleep(100);
    }
  }

  // Final save & update
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  
  console.log(`\n=== DONE ===`);
  console.log(`Extracted: ${extracted}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Errors:');
    errors.forEach(e => console.log('  -', e));
    fs.writeFileSync(path.join(__dirname, 'extraction_errors.txt'), errors.join('\n'));
  }

  updateIndexHtml(results);
  console.log('Done. Browser left open.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
