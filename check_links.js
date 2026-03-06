const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto('https://livecurve.euroventilatori-int.com/en/industrial-fans/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2000));
  const links = await p.$$eval('a.list-group-item', els => els.map(a => ({
    text: a.textContent?.trim(),
    href: a.href,
    toggle: a.dataset.toggle,
    visible: a.offsetParent !== null
  })));
  console.log(JSON.stringify(links.slice(0, 40), null, 2));
  await b.close();
})().catch(console.error);
