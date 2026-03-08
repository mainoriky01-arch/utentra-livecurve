# Task: Estrazione Curve Pressione Statica

## Obiettivo
Estrarre le curve di pressione STATICA da LiveCurve per tutti i 771 modelli e integrarle in `index.html`.

## Credenziali LiveCurve
- **URL:** https://livecurve.euroventilatori-int.com/en/industrial-fans/
- **Username:** awshdul175
- **Password:** pjcabet768

## Come funziona il sito
1. Login → seleziona Serie (es. APE) → seleziona Modello (es. APE 351/A)
2. Nel grafico SVG ci sono **sempre 2 curve (polyline)**:
   - **Polyline superiore** (Y più piccolo in coordinate SVG) = Pressione TOTALE
   - **Polyline inferiore** (Y più grande in coordinate SVG) = Pressione STATICA
3. L'iframe con il grafico ha `id="livecurve"`
4. Il SVG del grafico ha `id="chart-aeraulicCharacteristic"`

## Estrazione tecnica
```javascript
// Nel contesto dell'iframe livecurve
const svg = document.getElementById('chart-aeraulicCharacteristic');
const polylines = svg.querySelectorAll('polyline');

// polylines[0] = TOTAL (già estratta)
// polylines[1] = STATIC (da estrarre)
const staticPoints = polylines[1].getAttribute('points');
```

## Formato output
Ogni curva deve avere esattamente **30 punti** nel formato:
```
"x1,y1 x2,y2 x3,y3 ... x30,y30"
```

Dove x,y sono le coordinate SVG grezze (numeri decimali).

## File da modificare
`/Users/riccardomaino/.openclaw/workspace/utentra-livecurve/index.html`

Ogni modello ha questa struttura:
```javascript
"APE 351/A": {fMin:2,fMax:10,pMin:200,pMax:300,xMin:98,xMax:477,yMin:14,yMax:217,total:"...",area:0.00567},
```

Deve diventare:
```javascript
"APE 351/A": {fMin:2,fMax:10,pMin:200,pMax:300,xMin:98,xMax:477,yMin:14,yMax:217,total:"...",static:"...",area:0.00567},
```

## Serie da processare (28 serie, 771 modelli)
APE(16), APEc(10), APF(30), APG(43), APRED(10), APRF(42), APRFD(22), APRG(43), APRGD(11), APRH(31), APRI(26), APRL(12), BP(34), BPR(49), BT(10), EU(25), EUK(49), EUM(22), EVF(80), EVL(80), EVP(16), EVT(9), MPR(11), TF(18), TH(32), TPA(13), TQ(8), TR(19)

## Checkpoint
Ogni **20-30 modelli**, salva il progresso e riporta:
- Quanti modelli completati
- Ultima serie/modello processato
- Eventuali errori

## Unità di misura
- Portata: **m³/h** (NON m³/min)
- Pressione: **kg/m²**

## Verifica finale
Dopo l'integrazione, testare APE 351/A a 522 m³/h:
- Pressione STATICA attesa: **162.58 kg/m²** (da LiveCurve)

## Note
- Il browser deve essere già attivo con profilo `openclaw`
- CDP port: 18800
- Se il sito si disconnette, rifare login
