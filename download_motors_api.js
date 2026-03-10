const https = require('https');
const fs = require('fs');

const API_BASE = 'https://livecurve.euroventilatori-int.com/fancatalog/FanData/';

function fetchJson(id) {
    return new Promise((resolve) => {
        https.get(API_BASE + id, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function downloadMotors() {
    const allFans = {};
    let found = 0;
    
    console.log('Downloading fan data from API...\n');
    
    // Scan IDs 1-1500
    for (let id = 1; id <= 1500; id++) {
        const data = await fetchJson(id);
        if (data && data.DisplayName) {
            allFans[data.DisplayName] = {
                id: data.Id,
                motorSize: data.InstalledEngine,
                poles: data.NumberOfPoles,
                power: data.InstalledPower,
                frequency: data.Frequency
            };
            found++;
            process.stdout.write(`\r[${id}/1500] Found: ${found}`);
        }
    }
    
    console.log(`\n\nTotal found: ${found}`);
    
    // Save results
    fs.writeFileSync('/tmp/motors_api.json', JSON.stringify(allFans, null, 2));
    console.log('Saved to /tmp/motors_api.json');
    
    // Check coverage against curves.json
    const curves = JSON.parse(fs.readFileSync('./curves.json', 'utf8'));
    const curveModels = new Set();
    for (const series of Object.values(curves)) {
        for (const model of Object.keys(series)) {
            curveModels.add(model);
        }
    }
    
    const matched = [...curveModels].filter(m => allFans[m]);
    const missing = [...curveModels].filter(m => !allFans[m]);
    
    console.log(`\nCoverage: ${matched.length}/${curveModels.size} (${(100*matched.length/curveModels.size).toFixed(1)}%)`);
    
    if (missing.length > 0) {
        console.log(`Missing ${missing.length} models`);
        if (missing.length <= 50) {
            console.log(missing.join(', '));
        }
    }
}

downloadMotors().catch(console.error);
