// Wrapped IIFE version for browser injection
(function() {

const TARGET_SERIES = [
  'APRF', 'APRG', 'APRH', 'APRI', 'APRL',
  'EU', 'EUM', 'EUK', 'MPR', 'TF', 'TG', 'TH', 'TPA', 'TQ', 'TR',
  'BP', 'BPR', 'BT',
  'EVF', 'EVL', 'EVP', 'EVT',
  'APRED', 'APRFD', 'APRGD'
];

if (window.__LC_STATUS === 'running') { console.log('[LC] Already running!'); return; }

window.__LC_DATA = window.__LC_DATA || {};
window.__LC_STATUS = 'starting';
window.__LC_LOG = [];
window.__LC_CURRENT = null;

function lcLog(msg) {
  const ts = new Date().toLocaleTimeString();
  const line = '[' + ts + '] ' + msg;
  window.__LC_LOG.push(line);
  if (window.__LC_LOG.length > 2000) window.__LC_LOG.shift();
  console.log('[LC]', msg);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractAxisParams(svg) {
  const texts = Array.from(svg.querySelectorAll('text'));
  const xLabels = [], yLabels = [];
  texts.forEach(function(t) {
    const val = parseFloat(t.textContent.trim());
    if (isNaN(val) || val <= 0) return;
    const x = parseFloat(t.getAttribute('x') || 0);
    const y = parseFloat(t.getAttribute('y') || 0);
    if (y > 300 && y < 345 && x > 40) xLabels.push({ val, x, y });
    else if (x < 55 && y > 10 && y < 340 && val >= 10) yLabels.push({ val, x, y });
  });
  xLabels.sort(function(a, b) { return a.x - b.x; });
  yLabels.sort(function(a, b) { return b.y - a.y; });
  const xMin = 45, xMax = 495, yMin = 10, yMax = 330;
  const fMin = xLabels.length ? xLabels[0].val : null;
  const fMax = xLabels.length ? xLabels[xLabels.length - 1].val : null;
  const pMin = yLabels.length ? yLabels[0].val : null;
  let pMax = null;
  if (pMin && yLabels.length >= 2) {
    const tick2 = yLabels[1];
    const ratio = (yMax - tick2.y) / (yMax - yMin);
    if (ratio > 0.05) {
      const lnRatio = Math.log(tick2.val / pMin);
      pMax = Math.round(pMin * Math.exp(lnRatio / ratio) / 10) * 10;
    }
  }
  if (!pMax && pMin && yLabels.length >= 2) {
    const rA = (yMax - yLabels[0].y) / (yMax - yMin);
    if (rA > 0.001) {
      const L = Math.log(yLabels[0].val / pMin) / rA;
      pMax = Math.round(pMin * Math.exp(L) / 10) * 10;
    }
  }
  return { fMin, fMax, pMin, pMax, xMin, xMax, yMin, yMax };
}

async function extractCurrentModel() {
  await delay(700);
  const iframe = document.querySelector('iframe');
  if (!iframe) return null;
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return null;
    const svg = doc.querySelector('svg');
    if (!svg) return null;
    const polylines = svg.querySelectorAll('polyline');
    if (!polylines.length) return null;
    const totalPts = polylines[0] ? polylines[0].getAttribute('points') : '';
    const staticPts = polylines[1] ? polylines[1].getAttribute('points') : '';
    if (!totalPts) return null;
    const axis = extractAxisParams(svg);
    return Object.assign({ total: totalPts, static: staticPts }, axis);
  } catch(e) { return { error: e.message }; }
}

async function extractSeries(seriesName) {
  lcLog('▶ ' + seriesName);
  window.__LC_CURRENT = seriesName;
  const links = Array.from(document.querySelectorAll('a[href="#fan-detail"]'));
  const sl = links.find(function(l) { return l.textContent.trim() === seriesName; });
  if (!sl) { lcLog('✗ NOT FOUND: ' + seriesName); window.__LC_DATA[seriesName] = { error: 'not_found', models: [] }; return; }
  sl.click();
  await delay(1500);
  const select = document.querySelector('select');
  if (!select) { lcLog('✗ No select for ' + seriesName); window.__LC_DATA[seriesName] = { error: 'no_select', models: [] }; return; }
  const opts = Array.from(select.options).filter(function(o) { return o.value && o.text.trim(); });
  lcLog('  ' + opts.length + ' models in ' + seriesName);
  const results = [];
  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    select.value = opt.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const data = await extractCurrentModel();
    if (data && !data.error && data.total) {
      results.push({ model: opt.text.trim(), fMin: data.fMin, fMax: data.fMax, pMin: data.pMin, pMax: data.pMax, xMin: data.xMin, xMax: data.xMax, yMin: data.yMin, yMax: data.yMax, total: data.total, static: data.static });
      if ((i % 5) === 0) lcLog('  ✓ ' + opt.text.trim() + ' (' + i + '/' + opts.length + ')');
    } else {
      results.push({ model: opt.text.trim(), error: (data && data.error) || 'no_data' });
    }
    await delay(450);
  }
  const okCount = results.filter(function(r) { return !r.error; }).length;
  window.__LC_DATA[seriesName] = { series: seriesName, count: okCount, models: results, extractedAt: new Date().toISOString() };
  lcLog('✓ ' + seriesName + ': ' + okCount + '/' + opts.length);
}

async function runExtraction() {
  window.__LC_STATUS = 'running';
  lcLog('=== START v2 - ' + TARGET_SERIES.length + ' series ===');
  let total = 0;
  for (let s = 0; s < TARGET_SERIES.length; s++) {
    const series = TARGET_SERIES[s];
    if (window.__LC_DATA[series] && window.__LC_DATA[series].count > 0) {
      lcLog('↷ Skip ' + series + ' (' + window.__LC_DATA[series].count + ')');
      total += window.__LC_DATA[series].count;
      continue;
    }
    try {
      await extractSeries(series);
      total += (window.__LC_DATA[series] && window.__LC_DATA[series].count) || 0;
    } catch(e) {
      lcLog('✗ ERROR ' + series + ': ' + e.message);
      window.__LC_DATA[series] = { error: e.message, models: [] };
    }
    await delay(1000);
  }
  window.__LC_STATUS = 'complete';
  window.__LC_CURRENT = null;
  lcLog('=== COMPLETE: ' + total + ' models ===');
}

runExtraction().catch(function(e) {
  window.__LC_STATUS = 'error';
  lcLog('FATAL: ' + e.message);
});

})();
