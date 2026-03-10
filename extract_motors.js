const { chromium } = require('playwright');
const fs = require('fs');

const curves = JSON.parse(fs.readFileSync('./curves.json', 'utf8'));

// Collect all models
const allModels = [];
for (const [series, models] of Object.entries(curves)) {
    for (const modelName of Object.keys(models)) {
        allModels.push({ series, model: modelName });
    }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractMotors() {
    const browser = await chromium.connectOverCDP('http://localhost:18800');
    const context = browser.contexts()[0];
    
    // Find LiveCurve ricerca page
    let pages = context.pages();
    let page = pages.filter(p => p.url().includes('livecurve') && p.url().includes('ricerca')).pop();
    
    if (!page) {
        // Navigate to ricerca page
        page = pages.filter(p => p.url().includes('livecurve')).pop();
        if (!page) { console.log('ERROR: No LiveCurve page'); return; }
        await page.goto('https://livecurve.euroventilatori-int.com/it/ricerca/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
    }
    
    const isLoggedIn = await page.evaluate(() => document.body.innerText.includes('Log out'));
    if (!isLoggedIn) { console.log('ERROR: Not logged in'); return; }
    console.log('✓ Logged in on:', page.url());
    
    const motorData = {};
    let done = 0;
    let na = 0;
    let errors = 0;
    
    // Group models by series to minimize searches
    const bySeries = {};
    for (const { series, model } of allModels) {
        if (!bySeries[series]) bySeries[series] = [];
        bySeries[series].push(model);
    }
    
    for (const [series, modelNames] of Object.entries(bySeries)) {
        console.log(`\n=== ${series} (${modelNames.length} models) ===`);
        
        // Get a representative model from this series
        const firstModel = curves[series][modelNames[0]];
        const midFlow = Math.round((firstModel.fMin + firstModel.fMax) / 2);
        const midPressure = Math.round((firstModel.pMin + firstModel.pMax) / 2);
        
        // Search WITHOUT navigating away - use JS to trigger search
        const searchSuccess = await page.evaluate(async ({ flow, pressure }) => {
            try {
                const portataInput = document.querySelector('input[placeholder*="Portata"]');
                const pressioneInput = document.querySelector('input[placeholder*="Pressione"]');
                
                if (!portataInput || !pressioneInput) return false;
                
                // Set values and trigger events
                portataInput.value = flow;
                pressioneInput.value = pressure;
                portataInput.dispatchEvent(new Event('input', { bubbles: true }));
                portataInput.dispatchEvent(new Event('change', { bubbles: true }));
                pressioneInput.dispatchEvent(new Event('input', { bubbles: true }));
                pressioneInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Click search button
                const btn = document.querySelector('button:not([type="submit"])') || document.querySelector('button');
                if (btn) btn.click();
                
                return true;
            } catch(e) {
                return false;
            }
        }, { flow: midFlow, pressure: midPressure });
        
        if (!searchSuccess) {
            console.log(`  Failed to trigger search for ${series}, skipping`);
            continue;
        }
        
        await sleep(3000);
        
        // Get results
        const resultsInPage = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tbody tr');
            const models = [];
            rows.forEach(row => {
                const cell = row.querySelector('td:first-child');
                if (cell) {
                    const text = cell.innerText.trim();
                    if (/\d/.test(text) && text.length < 25) models.push(text);
                }
            });
            return models;
        });
        
        console.log(`  Found ${resultsInPage.length} models in search`);
        
        // For each model in results that belongs to our list
        for (const modelInPage of resultsInPage) {
            if (motorData[modelInPage]) continue;
            
            // Click on it using JS (no navigation)
            await page.evaluate((modelName) => {
                const rows = document.querySelectorAll('table tbody tr td:first-child');
                for (const cell of rows) {
                    if (cell.innerText.trim() === modelName) {
                        cell.click();
                        return true;
                    }
                }
                return false;
            }, modelInPage);
            
            await sleep(2000);
            
            // Read iframe
            try {
                const iframeEl = await page.$('iframe[src*="FanView"]');
                if (!iframeEl) {
                    motorData[modelInPage] = { motorSize: null, poles: null, power: null };
                    continue;
                }
                
                const iframeContent = await page.evaluate(() => {
                    const iframe = document.querySelector('iframe[src*="FanView"]');
                    if (!iframe) return null;
                    try {
                        return iframe.contentDocument.body.innerText;
                    } catch(e) { return null; }
                });
                
                if (!iframeContent) {
                    motorData[modelInPage] = { motorSize: null, poles: null, power: null };
                    errors++;
                    continue;
                }
                
                // Parse motor data
                const match = iframeContent.match(/(\d+)\s*([A-Z]+)\s*-\s*(\d+)\s*poli?\s*-\s*(\d+)\s*Hz\s*-\s*([\d.]+)\s*kW/i);
                const isNA = iframeContent.includes('N/A') || !iframeContent.includes('kW');
                
                if (match) {
                    motorData[modelInPage] = {
                        motorSize: match[1] + ' ' + match[2],
                        poles: parseInt(match[3]),
                        power: parseFloat(match[5])
                    };
                    done++;
                    console.log(`  ✓ ${modelInPage}: ${motorData[modelInPage].motorSize} ${motorData[modelInPage].poles}p ${motorData[modelInPage].power}kW`);
                } else {
                    motorData[modelInPage] = { motorSize: null, poles: null, power: null };
                    na++;
                    console.log(`  - ${modelInPage}: ${isNA ? 'N/A' : 'not parsed'}`);
                }
            } catch(e) {
                motorData[modelInPage] = { motorSize: null, poles: null, power: null };
                errors++;
                console.log(`  ✗ ${modelInPage}: ${e.message.substring(0, 50)}`);
            }
        }
        
        // Save after each series
        fs.writeFileSync('/tmp/motors_progress.json', JSON.stringify(motorData, null, 2));
    }
    
    fs.writeFileSync('/tmp/motors_final.json', JSON.stringify(motorData, null, 2));
    console.log(`\n=== DONE ===`);
    console.log(`With motor: ${done} | N/A: ${na} | Errors: ${errors}`);
    console.log(`Total saved: ${Object.keys(motorData).length}`);
}

extractMotors().catch(console.error);
