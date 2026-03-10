const { chromium } = require('playwright');
const fs = require('fs');

const curves = JSON.parse(fs.readFileSync('./curves.json', 'utf8'));

// Flatten all models
const allModels = [];
for (const [series, models] of Object.entries(curves)) {
    for (const [name, data] of Object.entries(models)) {
        allModels.push({ name, series, ...data });
    }
}

console.log(`Total models to extract: ${allModels.length}`);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractMotors() {
    const browser = await chromium.connectOverCDP('http://localhost:18800');
    const context = browser.contexts()[0];
    let pages = context.pages();
    let page = pages.filter(p => p.url().includes('livecurve')).pop();
    
    if (!page) { console.log('ERROR: No LiveCurve page'); return; }
    
    const isLoggedIn = await page.evaluate(() => document.body.innerText.includes('Log out'));
    if (!isLoggedIn) { console.log('ERROR: Not logged in'); return; }
    console.log('✓ Logged in\n');
    
    const motorData = {};
    let done = 0;
    let found = 0;
    let notFound = 0;
    
    for (const model of allModels) {
        done++;
        const midFlow = Math.round((model.fMin + model.fMax) / 2);
        const midPressure = Math.round((model.pMin + model.pMax) / 2);
        
        process.stdout.write(`\r[${done}/${allModels.length}] ${model.name.padEnd(20)} `);
        
        // Search with model's operating point
        await page.evaluate(({ flow, pressure }) => {
            const portataInput = document.querySelector('input[placeholder*="Portata"]');
            const pressioneInput = document.querySelector('input[placeholder*="Pressione"]');
            portataInput.value = flow;
            pressioneInput.value = pressure;
            portataInput.dispatchEvent(new Event('change', { bubbles: true }));
            pressioneInput.dispatchEvent(new Event('change', { bubbles: true }));
            document.querySelector('button').click();
        }, { flow: midFlow, pressure: midPressure });
        
        await sleep(2500);
        
        // Find and click on our model
        const clicked = await page.evaluate((modelName) => {
            const rows = document.querySelectorAll('table tbody tr td:first-child');
            for (const cell of rows) {
                const text = cell.innerText.trim();
                if (text === modelName || text.replace(/\s+/g, ' ') === modelName.replace(/\s+/g, ' ')) {
                    cell.click();
                    return true;
                }
            }
            return false;
        }, model.name);
        
        if (!clicked) {
            motorData[model.name] = { motorSize: null, poles: null, power: null, error: 'not in results' };
            notFound++;
            process.stdout.write('✗ not found\n');
            continue;
        }
        
        await sleep(2000);
        
        // Extract motor string from iframe
        const motorStr = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[src*="FanView"]');
            if (!iframe) return null;
            try {
                const text = iframe.contentDocument.body.innerText;
                // Look for pattern: "132 S - 2 poli - 50 Hz - 5.5 kW"
                const match = text.match(/(\d+)\s*([A-Z]+)\s*-\s*(\d+)\s*poli?\s*-\s*(\d+)\s*Hz\s*-\s*([\d.]+)\s*kW/i);
                if (match) {
                    return {
                        motorSize: match[1] + ' ' + match[2],
                        poles: parseInt(match[3]),
                        hz: parseInt(match[4]),
                        power: parseFloat(match[5])
                    };
                }
                // Check for N/A
                if (text.includes('N/A') || text.includes('MODELLO:\nN/A')) {
                    return { na: true };
                }
                return null;
            } catch(e) { return null; }
        });
        
        if (motorStr && motorStr.motorSize) {
            motorData[model.name] = motorStr;
            found++;
            process.stdout.write(`✓ ${motorStr.motorSize} ${motorStr.poles}p ${motorStr.power}kW\n`);
        } else if (motorStr && motorStr.na) {
            motorData[model.name] = { motorSize: null, poles: null, power: null, trasmissione: true };
            found++;
            process.stdout.write('- trasmissione\n');
        } else {
            motorData[model.name] = { motorSize: null, poles: null, power: null, error: 'parse failed' };
            notFound++;
            process.stdout.write('? parse failed\n');
        }
        
        // Save progress every 50 models
        if (done % 50 === 0) {
            fs.writeFileSync('/tmp/motors_simple_progress.json', JSON.stringify(motorData, null, 2));
            console.log(`  [saved progress: ${Object.keys(motorData).length}]`);
        }
    }
    
    fs.writeFileSync('/tmp/motors_simple_final.json', JSON.stringify(motorData, null, 2));
    console.log(`\n=== DONE ===`);
    console.log(`Found: ${found} | Not found: ${notFound} | Total: ${done}`);
}

extractMotors().catch(console.error);
