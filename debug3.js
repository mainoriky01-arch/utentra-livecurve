// Intercetta chiamata AJAX per capire il payload e la risposta
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  
  // Intercetta richieste/risposte
  p.on('request', req => {
    if (req.url().includes('/ajax/')) {
      console.log('\n=== AJAX REQUEST ===');
      console.log('URL:', req.url());
      console.log('Method:', req.method());
      console.log('Headers:', JSON.stringify(req.headers(), null, 2));
      console.log('PostData:', req.postData());
    }
  });
  
  p.on('response', async res => {
    if (res.url().includes('/ajax/')) {
      console.log('\n=== AJAX RESPONSE ===');
      console.log('Status:', res.status());
      try {
        const body = await res.text();
        console.log('Body (first 2000):', body.slice(0, 2000));
      } catch(e) { console.log('Body error:', e.message); }
    }
  });

  await p.goto('https://livecurve.euroventilatori-int.com/en/industrial-fans/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('Page loaded. Trying to select APE series...');
  
  // Prova a espandere l'accordion in modo più aggressivo
  await p.evaluate(() => {
    // Apri tutti gli accordion
    const collapseEls = document.querySelectorAll('.collapse');
    collapseEls.forEach(el => el.classList.add('in'));
    
    // Ora cerca il link APE
    const links = Array.from(document.querySelectorAll('a'));
    const ape = links.find(a => a.textContent?.trim() === 'APE');
    console.log('APE found:', ape?.href, 'visible:', ape?.offsetParent !== null);
    if (ape) ape.click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Check DOM
  const dom = await p.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({src: f.src?.slice(0,100), visible: f.offsetParent !== null}));
    const selects = Array.from(document.querySelectorAll('select')).map(s => ({name: s.name||s.id, count: s.options.length, first: s.options[0]?.text}));
    return { url: window.location.href, iframes, selects };
  });
  console.log('\n=== DOM after click ===');
  console.log(JSON.stringify(dom, null, 2));
  
  await b.close();
})().catch(console.error);
