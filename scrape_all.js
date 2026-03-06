/**
 * scrape_all.js - Estrae TUTTI i dati curva da livecurve.euroventilatori-int.com
 * Salva in data/ALL_CURVES.json - struttura pronta per LiveCurve di Utentra
 * 
 * Uso: node scrape_all.js
 * Riprende dal punto in cui si era fermato (progress file)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://livecurve.euroventilatori-int.com/en/industrial-fans/';
const OUT = path.join(__dirname, 'data', 'ALL_CURVES.json');
const PROGRESS = path.join(__dirname, 'data', 'scrape_progress.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
}

function parsePoints(pointsStr) {
  if (!pointsStr) return [];
  return pointsStr.trim().split(/\s+/).map(pair => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
}

function svgToReal(points, svgX, svgY, flowMin, flowMax, pressureMin, pressureMax) {
  // Converti coordinate SVG in valori reali (portata, pressione)
  return points.map(p => {
    const flowNorm = (p.x - svgX.min) / (svgX.max - svgX.min);
    const pressNorm = 1 - (p.y - svgY.min) / (svgY.max - svgY.min); // Y è invertita in SVG
    return {
      flow: Math.round((flowMin + flowNorm * (flowMax - flowMin)) * 100) / 100,
      pressure: Math.round((pressureMin + pressNorm * (pressureMax - pressureMin)) * 100) / 100
    };
  });
}

async function main() {
  // Carica progresso
  let progress = { completedSeries: [], data: [] };
  if (fs.existsSync(PROGRESS)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); }
    catch(e) { console.log('Fresh start'); }
  }

  console.log(`📂 Progresso precedente: ${progress.completedSeries.length} serie completate, ${progress.data.length} modelli`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('🌐 Caricamento LiveCurve...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // Ottieni tutte le serie reali: href /en/products/... (no collapse, no categorie)
  const allSeries = await page.$$eval('a.list-group-item', els =>
    els
      .filter(a => a.href && a.href.includes('/en/products/') && !a.dataset.toggle)
      .map(a => ({ name: a.textContent?.trim(), href: a.href }))
      .filter(s => s.name)
  );

  console.log(`📋 Serie trovate: ${allSeries.length}`);
  allSeries.forEach(s => console.log(`   - ${s.name}`));

  for (const series of allSeries) {
    if (progress.completedSeries.includes(series.name)) {
      console.log(`⏭ Salto ${series.name} (già completata)`);
      continue;
    }

    console.log(`\n🔄 Estrazione serie: ${series.name}`);

    // Naviga direttamente alla pagina della serie
    await page.goto(series.href, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1500);

    // Ottieni modelli dal select VENTILATORI (esclude select-paese che ha > 200 opzioni)
    // Il select dei ventilatori ha opzioni con nomi tipo "APE 200", non paesi
    const modelCount = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const s of selects) {
        const firstOpt = s.options[0]?.text || '';
        // Select ventilatori: prima opzione è spesso vuota o ha nome modello (non "Select..." o paese)
        // Ha meno di 200 opzioni solitamente
        if (s.options.length > 0 && s.options.length < 200) {
          // Verifica che non sia il select dei paesi
          const isCountrySelect = /select|country|nation|italia/i.test(firstOpt);
          if (!isCountrySelect) return s.options.length;
        }
      }
      return 0;
    }).catch(() => 0);
    if (modelCount === 0) {
      console.warn(`  ⚠ Nessun modello trovato per ${series.name}`);
      progress.completedSeries.push(series.name);
      saveProgress(progress);
      continue;
    }

    console.log(`   ${modelCount} modelli da estrarre...`);

    for (let i = 0; i < modelCount; i++) {
      // Seleziona modello nel select ventilatori (non quello dei paesi)
      const modelName = await page.evaluate((idx) => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const s of selects) {
          if (s.options.length > 0 && s.options.length < 200) {
            const firstOpt = s.options[0]?.text || '';
            if (!/select|country|nation|italia/i.test(firstOpt)) {
              s.selectedIndex = idx;
              s.dispatchEvent(new Event('change', { bubbles: true }));
              return s.options[idx]?.text || '';
            }
          }
        }
        return '';
      }, i);

      await sleep(600);

      try {
        // Ottieni iframe
        const iframeEl = await page.$('iframe');
        if (!iframeEl) { console.warn(`    ⚠ No iframe for ${modelName}`); continue; }
        
        const frame = await iframeEl.contentFrame();
        if (!frame) { console.warn(`    ⚠ No frame for ${modelName}`); continue; }

        await sleep(300);

        // Estrai asse bounds
        const bounds = await frame.evaluate(() => {
          const texts = Array.from(document.querySelectorAll('text'))
            .map(t => t.textContent?.trim())
            .filter(t => t && /^[\d.]+$/.test(t))
            .map(Number)
            .sort((a, b) => a - b);

          const lines = Array.from(document.querySelectorAll('line'));
          const xs = [], ys = [];
          lines.forEach(l => {
            const x1 = l.getAttribute('x1');
            if (x1 !== null) {
              xs.push(+x1, +(l.getAttribute('x2')||0));
              ys.push(+(l.getAttribute('y1')||0), +(l.getAttribute('y2')||0));
            }
          });

          const flowVals = texts.filter(n => n < 200);
          const pressureVals = texts.filter(n => n >= 200);

          return {
            flow: { min: flowVals[0] ?? 0, max: flowVals[flowVals.length-1] ?? 50 },
            pressure: { min: pressureVals[0] ?? 0, max: pressureVals[pressureVals.length-1] ?? 1000 },
            svgX: { min: Math.min(...xs, 9999), max: Math.max(...xs, 0) },
            svgY: { min: Math.min(...ys, 9999), max: Math.max(...ys, 0) }
          };
        });

        // Estrai polylines
        const polylines = await frame.evaluate(() => {
          return Array.from(document.querySelectorAll('polyline')).map(pl => ({
            points: pl.getAttribute('points') || '',
            stroke: pl.getAttribute('stroke') || '',
            fill: pl.getAttribute('fill') || '',
            strokeWidth: pl.getAttribute('stroke-width') || ''
          }));
        });

        // Converti punti SVG in valori reali
        const convertedCurves = polylines.map(pl => {
          const rawPoints = parsePoints(pl.points);
          const realPoints = svgToReal(
            rawPoints,
            bounds.svgX, bounds.svgY,
            bounds.flow.min, bounds.flow.max,
            bounds.pressure.min, bounds.pressure.max
          );
          return {
            stroke: pl.stroke,
            fill: pl.fill,
            strokeWidth: pl.strokeWidth,
            rawPoints: pl.points, // mantieni raw per debug
            realPoints
          };
        });

        const modelData = {
          series: series.name,
          model: modelName,
          axes: bounds,
          curves: convertedCurves
        };

        progress.data.push(modelData);
        console.log(`    ✅ ${modelName} (${polylines.length} curve, flow: ${bounds.flow.min}-${bounds.flow.max}, p: ${bounds.pressure.min}-${bounds.pressure.max})`);

      } catch (e) {
        console.warn(`    ❌ Errore ${modelName}: ${e.message}`);
        progress.data.push({
          series: series.name,
          model: modelName,
          error: e.message
        });
      }

      // Salva progresso ogni 10 modelli
      if (i % 10 === 9) saveProgress(progress);
    }

    progress.completedSeries.push(series.name);
    saveProgress(progress);
    console.log(`  ✅ Serie ${series.name} completata (${modelCount} modelli)`);
  }

  await browser.close();

  // Salva output finale
  const output = {
    extractedAt: new Date().toISOString(),
    totalModels: progress.data.filter(d => !d.error).length,
    totalSeries: progress.completedSeries.length,
    series: progress.completedSeries,
    models: progress.data
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\n🎉 COMPLETATO!`);
  console.log(`   Modelli estratti: ${output.totalModels}`);
  console.log(`   Serie: ${output.totalSeries}`);
  console.log(`   File: ${OUT}`);
}

main().catch(e => {
  console.error('ERRORE FATALE:', e);
  process.exit(1);
});
