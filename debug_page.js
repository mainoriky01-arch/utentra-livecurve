// Debugga struttura pagina dopo selezione modello
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: false }); // visibile per debug
  const p = await b.newPage();
  await p.goto('https://livecurve.euroventilatori-int.com/en/products/000048-high-pressure-ap-ape/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2000));

  // Cerca il select ventilatori e seleziona primo modello
  const selInfo = await p.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    return selects.map(s => ({
      id: s.id, name: s.name, count: s.options.length,
      first: s.options[0]?.text, last: s.options[s.options.length-1]?.text
    }));
  });
  console.log('Selects:', JSON.stringify(selInfo, null, 2));

  // Seleziona primo modello
  await p.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const s of selects) {
      if (s.options.length > 0 && s.options.length < 200) {
        s.selectedIndex = 0;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // Ora controlla struttura DOM
  const domInfo = await p.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src, id: f.id, class: f.className, visible: f.offsetParent !== null
    }));
    const svgs = Array.from(document.querySelectorAll('svg')).length;
    const polylines = Array.from(document.querySelectorAll('polyline')).length;
    const embedDiv = document.querySelector('#chart, #curve, [id*="chart"], [id*="curve"], [class*="chart"], [class*="curve"]');
    return {
      iframes,
      svgCount: svgs,
      polylineCount: polylines,
      embedDiv: embedDiv ? { id: embedDiv.id, class: embedDiv.className, html: embedDiv.innerHTML.slice(0, 200) } : null,
      bodySnippet: document.body.innerHTML.slice(2000, 4000)
    };
  });
  console.log('DOM after model select:', JSON.stringify(domInfo, null, 2));

  await b.close();
})().catch(console.error);
