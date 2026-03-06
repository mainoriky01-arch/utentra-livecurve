// Debugga cosa succede cliccando una serie da industrial-fans
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  
  // Intercetta richieste di rete per capire come funziona
  p.on('request', req => {
    if (!req.url().includes('google') && !req.url().includes('fonts')) {
      console.log('REQ:', req.method(), req.url().slice(0, 100));
    }
  });

  await p.goto('https://livecurve.euroventilatori-int.com/en/industrial-fans/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 1500));
  
  // Espandi accordion "High pressure" e poi clicca APE
  console.log('\n--- Expanding High pressure accordion ---');
  await p.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a.list-group-item'));
    const highP = links.find(a => a.textContent?.trim() === 'High pressure');
    if (highP) highP.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Controlla se APE è ora visibile
  const apeVisible = await p.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a.list-group-item'));
    const ape = links.find(a => a.textContent?.trim() === 'APE');
    return ape ? { visible: ape.offsetParent !== null, href: ape.href } : null;
  });
  console.log('APE after expanding:', apeVisible);

  // Clicca APE se visibile
  if (apeVisible?.visible) {
    console.log('\n--- Clicking APE ---');
    await p.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.list-group-item'));
      const ape = links.find(a => a.textContent?.trim() === 'APE');
      if (ape) ape.click();
    });
    await new Promise(r => setTimeout(r, 1500));
  }

  // Controlla DOM dopo click
  const domInfo = await p.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src?.slice(0, 80), visible: f.offsetParent !== null, w: f.width, h: f.height
    }));
    const selects = Array.from(document.querySelectorAll('select')).map(s => ({
      name: s.name, count: s.options.length, first: s.options[0]?.text
    }));
    const url = window.location.href;
    return { url, iframes, selects };
  });
  console.log('\nDOM after APE click:', JSON.stringify(domInfo, null, 2));
  
  await b.close();
})().catch(console.error);
