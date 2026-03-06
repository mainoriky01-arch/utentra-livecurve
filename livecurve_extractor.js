/**
 * LiveCurve Autonomous Extractor v2
 * Injects into the browser page and runs autonomously.
 * Extracts polyline SVG data for all target series.
 * Results stored in window.__LC_DATA
 */

// ===== SERIES TO EXTRACT =====
const TARGET_SERIES = [
  'APRF', 'APRG', 'APRH', 'APRI', 'APRL',
  'EU', 'EUM', 'EUK', 'MPR', 'TF', 'TG', 'TH', 'TPA', 'TQ', 'TR',
  'BP', 'BPR', 'BT',
  'EVF', 'EVL', 'EVP', 'EVT',
  'APRED', 'APRFD', 'APRGD'
];

// ===== INIT STATE =====
window.__LC_DATA = window.__LC_DATA || {};
window.__LC_STATUS = 'idle';
window.__LC_LOG = window.__LC_LOG || [];
window.__LC_CURRENT = null;
window.__LC_ERROR = null;

function lcLog(msg) {
  const ts = new Date().toLocaleTimeString();
  window.__LC_LOG.push(`[${ts}] ${msg}`);
  console.log('[LC]', msg);
}

// ===== DELAY =====
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== EXTRACT AXIS FROM SVG =====
function extractAxisParams(svg) {
  const texts = Array.from(svg.querySelectorAll('text'));
  
  const xLabels = [];
  const yLabels = [];
  
  texts.forEach(t => {
    const rawVal = t.textContent.trim();
    const val = parseFloat(rawVal);
    if (isNaN(val) || val <= 0) return;
    
    const x = parseFloat(t.getAttribute('x') || 0);
    const y = parseFloat(t.getAttribute('y') || 0);
    
    // X-axis labels: at bottom of chart (y near 330)
    if (y > 300 && y < 345 && x > 40) {
      xLabels.push({ val, x, y });
    }
    // Y-axis labels: at left of chart (x < 50, y reasonable)
    else if (x < 55 && y > 10 && y < 340 && val >= 10) {
      yLabels.push({ val, x, y });
    }
  });
  
  xLabels.sort((a, b) => a.x - b.x);
  yLabels.sort((a, b) => b.y - a.y); // bottom to top (min to max pressure)
  
  const xMin = 45, xMax = 495;
  const yMin = 10, yMax = 330;
  
  const fMin = xLabels[0]?.val || null;
  const fMax = xLabels[xLabels.length - 1]?.val || null;
  
  // pMin is the bottom-most label
  const pMin = yLabels[0]?.val || null;
  
  // pMax computed from second tick
  let pMax = null;
  if (pMin && yLabels.length >= 2) {
    const tick2 = yLabels[1];
    const ratio = (yMax - tick2.y) / (yMax - yMin);
    if (ratio > 0.05) {
      const lnRatio = Math.log(tick2.val / pMin);
      const lnPmaxPmin = lnRatio / ratio;
      pMax = Math.round(pMin * Math.exp(lnPmaxPmin) / 10) * 10; // round to nearest 10
    }
  }
  
  // fallback: use last two ticks
  if (!pMax && yLabels.length >= 2) {
    const tickA = yLabels[0]; const tickB = yLabels[1];
    const rA = (yMax - tickA.y) / (yMax - yMin);
    const rB = (yMax - tickB.y) / (yMax - yMin);
    // solve: rA = ln(tickA.val/pMin)/L, rB = ln(tickB.val/pMin)/L
    // L = ln(tickA.val/pMin)/rA
    if (rA > 0.001) {
      const L = Math.log(tickA.val / pMin) / rA;
      pMax = Math.round(pMin * Math.exp(L) / 10) * 10;
    }
  }
  
  return {
    fMin, fMax, pMin, pMax,
    xMin, xMax, yMin, yMax,
    xTicks: xLabels,
    yTicks: yLabels
  };
}

// ===== EXTRACT CURRENT MODEL DATA =====
async function extractCurrentModel() {
  await delay(700); // wait for iframe to settle
  
  const iframe = document.querySelector('iframe');
  if (!iframe) return null;
  
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return null;
    
    const svg = doc.querySelector('svg');
    if (!svg) return null;
    
    const polylines = svg.querySelectorAll('polyline');
    if (!polylines.length) return null;
    
    const totalPts = polylines[0]?.getAttribute('points') || '';
    const staticPts = polylines[1]?.getAttribute('points') || '';
    
    if (!totalPts) return null;
    
    const axis = extractAxisParams(svg);
    
    return {
      total: totalPts,
      static: staticPts,
      ...axis
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ===== EXTRACT ONE SERIES =====
async function extractSeries(seriesName) {
  lcLog(`▶ Starting series: ${seriesName}`);
  window.__LC_CURRENT = seriesName;
  
  // Find sidebar link
  const links = Array.from(document.querySelectorAll('a[href="#fan-detail"]'));
  const seriesLink = links.find(l => l.textContent.trim() === seriesName);
  
  if (!seriesLink) {
    lcLog(`✗ NOT FOUND in sidebar: ${seriesName}`);
    window.__LC_DATA[seriesName] = { error: 'not_found', models: [] };
    return;
  }
  
  seriesLink.click();
  await delay(1200); // wait for AJAX + dropdown update
  
  const select = document.querySelector('select');
  if (!select) {
    lcLog(`✗ No dropdown for ${seriesName}`);
    window.__LC_DATA[seriesName] = { error: 'no_dropdown', models: [] };
    return;
  }
  
  const options = Array.from(select.options).filter(o => o.value && !o.disabled && o.text.trim());
  lcLog(`  Found ${options.length} models in ${seriesName}`);
  
  const results = [];
  
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const modelName = opt.text.trim();
    
    // Select this model
    select.value = opt.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    
    const data = await extractCurrentModel();
    
    if (data && !data.error && data.total) {
      results.push({
        model: modelName,
        fMin: data.fMin,
        fMax: data.fMax,
        pMin: data.pMin,
        pMax: data.pMax,
        xMin: data.xMin,
        xMax: data.xMax,
        yMin: data.yMin,
        yMax: data.yMax,
        total: data.total,
        static: data.static
      });
      lcLog(`  ✓ ${modelName} (${data.fMin}-${data.fMax} m³/min, ${data.pMin}-${data.pMax} kg/m²)`);
    } else {
      lcLog(`  ✗ ${modelName}: ${data?.error || 'no data'}`);
      results.push({ model: modelName, error: data?.error || 'no_data' });
    }
    
    await delay(420); // anti-ban
  }
  
  window.__LC_DATA[seriesName] = {
    series: seriesName,
    count: results.filter(r => !r.error).length,
    models: results,
    extractedAt: new Date().toISOString()
  };
  
  lcLog(`✓ ${seriesName}: ${results.filter(r => !r.error).length}/${options.length} models extracted`);
}

// ===== MAIN EXTRACTION LOOP =====
async function runExtraction() {
  window.__LC_STATUS = 'running';
  lcLog('=== LiveCurve Extraction v2 Started ===');
  lcLog(`Target: ${TARGET_SERIES.length} series`);
  
  let totalOk = 0;
  
  for (const series of TARGET_SERIES) {
    // Skip if already done
    if (window.__LC_DATA[series]?.count > 0) {
      lcLog(`↷ Skip ${series} (already done: ${window.__LC_DATA[series].count} models)`);
      totalOk += window.__LC_DATA[series].count;
      continue;
    }
    
    try {
      await extractSeries(series);
      totalOk += window.__LC_DATA[series]?.count || 0;
    } catch (e) {
      lcLog(`✗ ERROR in ${series}: ${e.message}`);
      window.__LC_DATA[series] = { error: e.message, models: [] };
    }
    
    await delay(800); // between series
  }
  
  window.__LC_STATUS = 'complete';
  window.__LC_CURRENT = null;
  lcLog(`=== DONE! Total models: ${totalOk} ===`);
}

// ===== START =====
if (window.__LC_STATUS !== 'running') {
  runExtraction().catch(e => {
    window.__LC_STATUS = 'error';
    window.__LC_ERROR = e.message;
    lcLog(`FATAL: ${e.message}`);
  });
} else {
  lcLog('Already running!');
}

'Extraction started. Poll window.__LC_STATUS and window.__LC_DATA for progress.';
