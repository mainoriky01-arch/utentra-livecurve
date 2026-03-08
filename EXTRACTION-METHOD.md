# METODO ESTRAZIONE CURVE LIVECURVE (VERIFICATO)

## ⛔ REGOLA D'ORO
**Se uno script funziona, USA QUELLO — non scriverne uno nuovo!**

Script verificati:
- `/tmp/extract_ape_v2.js` → APE (16 modelli) ✅
- `/tmp/extract_bp.js` → BP (34 modelli) ✅
- `/tmp/extract_all_series.js` → tutte le altre serie (copia esatta della logica APE)

Quando devi estrarre altre serie: **copia e adatta** lo script funzionante, non riscriverlo da zero.

## ⚠️ REGOLA FONDAMENTALE
**NON usare API JSON esistenti** - non hanno le curve statiche corrette!
**DEVI estrarre dal browser SVG** - è l'unico metodo accurato.

---

## Connessione Browser
```javascript
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:18800' });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes('livecurve'));
```

## Accesso all'iframe (CRITICO!)
Il grafico è dentro un iframe, NON nella pagina principale:
```javascript
const frame = page.frames().find(f => f.url().includes('FanView'));
```

## Estrazione Tick Assi

### Tick X (Portata) - hanno y="330" E x > 50
**IMPORTANTE**: Il filtro `x > 50` esclude il tick nell'angolo che appartiene all'asse Y!
```javascript
const xTicks = [];
frame.$eval('#chart-aeraulicCharacteristic-axes-layer', el => {
  el.querySelectorAll('text').forEach(t => {
    const y = parseFloat(t.getAttribute('y'));
    const x = parseFloat(t.getAttribute('x'));
    // y ≈ 330 (asse X) E x > 50 (esclude angolo)
    if (Math.abs(y - 330) < 5 && x > 50) {
      xTicks.push({ x, value: parseFloat(t.textContent) });
    }
  });
});
// Ordina per x
xTicks.sort((a, b) => a.x - b.x);
const X_fMin = xTicks[0].x;
const X_fMax = xTicks[xTicks.length - 1].x;
const fMin = xTicks[0].value;
const fMax = xTicks[xTicks.length - 1].value;
```

### Tick Y (Pressione) - hanno x="40"
```javascript
const yTicks = [];
frame.$eval('#chart-aeraulicCharacteristic-axes-layer', el => {
  el.querySelectorAll('text').forEach(t => {
    if (parseFloat(t.getAttribute('x')) === 40) {
      yTicks.push({ y: parseFloat(t.getAttribute('y')), value: parseFloat(t.textContent) });
    }
  });
});
// Ordina per y (crescente = pressione decrescente!)
yTicks.sort((a, b) => a.y - b.y);
const Y_pMax = yTicks[0].y;        // Y piccolo = pressione alta
const Y_pMin = yTicks[yTicks.length - 1].y;  // Y grande = pressione bassa
const pMax = yTicks[0].value;
const pMin = yTicks[yTicks.length - 1].value;
```

## Estrazione Polylines (Curve)
```javascript
const polylines = await frame.$$eval('#chart-aeraulicCharacteristic-curve-layer polyline', els => 
  els.map(p => p.getAttribute('points'))
);
// polylines[0] = TOTAL
// polylines[1] = STATIC

function parsePoints(pointsStr) {
  return pointsStr.split(' ').map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
}
const totalPts = parsePoints(polylines[0]);
const staticPts = parsePoints(polylines[1]);
```

## Conversione SVG → Valori Reali (SCALA LOGARITMICA!)

```javascript
// X → Flow (m³/h)
function svgToFlow(x) {
  const t = (x - X_fMin) / (X_fMax - X_fMin);
  return fMin * Math.pow(fMax / fMin, t);
}

// Y → Pressure (kg/m²)
function svgToPressure(y) {
  return pMax * Math.pow(pMin / pMax, (y - Y_pMax) / (Y_pMin - Y_pMax));
}

// Converti tutti i punti
const total = totalPts.map(p => [svgToFlow(p.x), svgToPressure(p.y)]);
const static_ = staticPts.map(p => [svgToFlow(p.x), svgToPressure(p.y)]);
```

## Output Formato
```json
{
  "APE 351/A": {
    "fMin": 100,
    "fMax": 600,
    "pMin": 200,
    "pMax": 300,
    "total": [[100.5, 249.3], [110.2, 248.1], ...],  // 30 punti [flow, pressure]
    "static": [[100.5, 244.8], [110.2, 243.2], ...]  // 30 punti [flow, pressure]
  }
}
```

## Script di Riferimento Funzionante
`/tmp/extract_ape_v2.js` - usato per APE (16 modelli) ✓
`/tmp/extract_bp.js` - usato per BP (34 modelli) ✓

## Verifiche Eseguite
| Modello | Portata | Total Calc | Total Atteso | Static Calc | Static Atteso |
|---------|---------|------------|--------------|-------------|---------------|
| APE 351/A | 522 | 203.42 | 203.42 | 162.55 | 162.58 |
| APE 711/A | 1000 | 1013.81 | 1013.90 | 918.17 | 918.30 |
| BP 501/A | 8000 | 192.01 | 192.01 | 182.22 | 182.22 |
| BP 161/A | 590 | 65.60 | 65.61 | 40.04 | 40.04 |
| BP 501/D | 10478 | 96.00 | 96.00 | 79.20 | 79.20 |

**Errore massimo: 0.02%**

---

## ⚠️ VERIFICA LOGIN (CRITICO!)
**Senza login, il sito mostra motori diversi e dati sbagliati!**

Prima di estrarre, verificare:
```javascript
const isLoggedIn = await page.evaluate(() => {
  return document.body.innerText.includes('Log out');
});
```

Se non loggato, fare login con:
- Username: `awshdul175`
- Password: `pjcabet768`

## Impostazioni LiveCurve Richieste
- PREMENTE (non aspirante)
- Temperatura: 15°C
- Altitudine: 0m
- **Inverter: OFF**
- Scala: LOGARITMICA
- Unità: m³/h, kW, kg/m², kgf
