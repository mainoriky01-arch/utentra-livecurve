const { chromium } = require('playwright');
const fs = require('fs');

const curves = JSON.parse(fs.readFileSync('./curves.json', 'utf8'));

// Calculate search points that will cover all models
// Group models by their mid-operating point
const searchPoints = [];
const modelMidPoints = {};

for (const [series, models] of Object.entries(curves)) {
    for (const [name, data] of Object.entries(models)) {
        const midFlow = Math.round((data.fMin + data.fMax) / 2);
        const midPressure = Math.round((data.pMin + data.pMax) / 2);
        modelMidPoints[name] = { flow: midFlow, pressure: midPressure };
    }
}

// Generate search points covering the range (flow: 500-100000, pressure: 50-2000)
const flowPoints = [500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 35000, 50000, 80000];
const pressurePoints = [100, 200, 350, 500, 700, 1000, 1500];

for (const f of flowPoints) {
    for (const p of pressurePoints) {
        searchPoints.push({ flow: f, pressure: p });
    }
}

console.log(`Generated ${searchPoints.length} search points to cover ${Object.keys(modelMidPoints).length} models`);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function rpmToPoles(rpm) {
    if (rpm >= 2700) return 2;
    if (rpm >= 1300) return 4;
    if (rpm >= 850) return 6;
    if (rpm >= 650) return 8;
    return null;
}

async function extractMotors() {
    const browser = await chromium.connectOverCDP('http://localhost:18800');
    const context = browser.contexts()[0];
    let pages = context.pages();
    let page = pages.filter(p => p.url().includes('livecurve')).pop();
    
    if (!page) { console.log('ERROR: No LiveCurve page'); return; }
    
    const isLoggedIn = await page.evaluate(() => document.body.innerText.includes('Log out'));
    if (!isLoggedIn) { console.log('ERROR: Not logged in'); return; }
    console.log('✓ Logged in');
    
    const motorData = {};
    let searchesDone = 0;
    
    for (const sp of searchPoints) {
        searchesDone++;
        process.stdout.write(`\r[${searchesDone}/${searchPoints.length}] Searching ${sp.flow} m³/h @ ${sp.pressure} kg/m² ... `);
        
        // Fill search form
        const searchOk = await page.evaluate(async ({ flow, pressure }) => {
            try {
                const portataInput = document.querySelector('input[placeholder*="Portata"]');
                const pressioneInput = document.querySelector('input[placeholder*="Pressione"]');
                
                if (!portataInput || !pressioneInput) return false;
                
                portataInput.value = flow;
                pressioneInput.value = pressure;
                portataInput.dispatchEvent(new Event('input', { bubbles: true }));
                portataInput.dispatchEvent(new Event('change', { bubbles: true }));
                pressioneInput.dispatchEvent(new Event('input', { bubbles: true }));
                pressioneInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                const btn = document.querySelector('button');
                if (btn) btn.click();
                return true;
            } catch(e) { return false; }
        }, sp);
        
        if (!searchOk) {
            console.log('SKIP (form error)');
            continue;
        }
        
        await sleep(3500);
        
        // Extract results from table
        const results = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tbody tr');
            const data = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    const model = cells[0]?.innerText?.trim();
                    const power = parseFloat(cells[2]?.innerText?.trim()) || null;
                    const rpm = parseInt(cells[3]?.innerText?.trim()) || null;
                    if (model && /\d/.test(model) && model.length < 30) {
                        data.push({ model, power, rpm });
                    }
                }
            });
            return data;
        });
        
        let newModels = 0;
        for (const r of results) {
            if (!motorData[r.model]) {
                motorData[r.model] = {
                    power: r.power,
                    poles: rpmToPoles(r.rpm),
                    rpm: r.rpm
                };
                newModels++;
            }
        }
        
        console.log(`found ${results.length}, ${newModels} new (total: ${Object.keys(motorData).length})`);
        
        // Save progress every 10 searches
        if (searchesDone % 10 === 0) {
            fs.writeFileSync('/tmp/motors_progress.json', JSON.stringify(motorData, null, 2));
        }
    }
    
    fs.writeFileSync('/tmp/motors_final.json', JSON.stringify(motorData, null, 2));
    
    // Check coverage
    const allModels = Object.keys(modelMidPoints);
    const found = allModels.filter(m => motorData[m]);
    const missing = allModels.filter(m => !motorData[m]);
    
    console.log(`\n=== DONE ===`);
    console.log(`Found: ${found.length}/${allModels.length} (${(100*found.length/allModels.length).toFixed(1)}%)`);
    console.log(`Missing: ${missing.length}`);
    if (missing.length > 0 && missing.length <= 20) {
        console.log('Missing models:', missing.join(', '));
    }
    
    // Save final with coverage info
    fs.writeFileSync('/tmp/motors_final.json', JSON.stringify({
        data: motorData,
        coverage: { found: found.length, total: allModels.length, missing }
    }, null, 2));
}

extractMotors().catch(console.error);
