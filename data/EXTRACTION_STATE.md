# LiveCurve Extraction State - 2026-03-06

## Obiettivo
Integrare tutte le curve di ventilatori Euroventilatori nel Fan Selector tool Utentra.

## File Target
`/Users/riccardomaino/.openclaw/workspace/utentra-livecurve/index.html`

## Stato Attuale: 286 modelli nel file

### Serie già integrate ✅
| Serie | Modelli | Note |
|-------|---------|------|
| APRH | 31 | Alta pressione |
| EUM | 23 | Media pressione |
| EUK | 49 | Media/alta pressione |
| BPR | 49 | Bassa pressione radiale |
| Legacy | ~134 | APE, APF, APG, etc. |

### Serie da estrarre ed aggiungere
| Serie | Modelli | Categoria |
|-------|---------|-----------|
| EVF | 80 | Forward-curved centrifugal |
| EVL | 80 | Forward-curved low pressure |
| EVP | 16 | Forward-curved plastic |
| EVT | 9 | Forward-curved transport |
| APRED | 10 | Direct drive radial |
| APRFD | 22 | Direct drive forward |
| APRGD | 11 | Direct drive backward |
| **TOTALE** | **228** | |

## Come estrarre dal browser

### Login LiveCurve
- URL: https://livecurve.euroventilatori-int.com/en/industrial-fans/
- Credenziali: awshdul175 / pjcabet768
- Account: Torftech Technologies Ltd.

### Script estrazione (da console browser)
```javascript
async function extractSeries() {
  const r = [];
  const s = document.querySelector('select');
  for (let i = 0; i < s.options.length; i++) {
    s.value = s.options[i].value;
    s.dispatchEvent(new Event('change', {bubbles: true}));
    await new Promise(x => setTimeout(x, 500));
    const f = document.querySelector('iframe[src*="FanView"]');
    if (f?.contentDocument) {
      for (let p of f.contentDocument.querySelectorAll('path')) {
        const d = p.getAttribute('d');
        if (d && d.length > 100) {
          r.push({
            m: s.options[i].text, 
            t: d.replace(/M |L /g, '').split(' ').map(n => parseFloat(n).toFixed(2)).join(' ')
          });
          break;
        }
      }
    }
  }
  return r;
}
```

### Conversione formato
```javascript
function convert(m, t, pMin, pMax) {
  const size = parseInt(m.match(/\d+/)[0]);
  const fMin = Math.round(size * 0.3);
  const fMax = Math.round(size * 2.5);
  const total = t.split(' ').reduce((acc, v, i, arr) => {
    if (i % 2 === 0) acc.push(v + ',' + arr[i+1]);
    return acc;
  }, []).join(' ');
  return `"${m}": {fMin:${fMin},fMax:${fMax},pMin:${pMin},pMax:${pMax},xMin:45,xMax:495,yMin:10,yMax:330,total:"${total}"}`;
}
```

## Formato MODELS nel file
```javascript
"NOME MODELLO": {
  fMin: portata_minima_m3h,
  fMax: portata_massima_m3h,
  pMin: pressione_minima_Pa,
  pMax: pressione_massima_Pa,
  xMin: 45, xMax: 495, yMin: 10, yMax: 330,
  total: "x1,y1 x2,y2 x3,y3..."
}
```

## Chart.js Note
- Usare `type: 'scatter'` con `showLine: true` (NON `type: 'line'`)
- Chart.js v4.5.1

## Server test
```bash
cd ~/.openclaw/workspace/utentra-livecurve && python3 -m http.server 4002
```
