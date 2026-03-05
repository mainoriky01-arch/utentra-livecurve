#!/usr/bin/env node
// LiveCurve Full Extraction Script
// Extracts all fan specs via AJAX API

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://livecurve.euroventilatori-int.com';
const AJAX_URL = '/en/ajax/';
const COOKIE = 'displayCookieConsent=y; _ga=GA1.2.354843275.1770941039; _gid=GA1.2.1565039020.1772573118; ASPSESSIONIDSERBRTAS=MFONDOIDMMNPOMMCECMDAMGK; ASPSESSIONIDSGTATRAS=MMHJMIFADBCJAPDJACJDMCBM';
const DATA_DIR = path.join(__dirname, 'data');

const ALL_SERIES = [
  // High Pressure - AP
  {name: 'APE', id: 48},
  {name: 'APF', id: 49},
  {name: 'APG', id: 50},
  // High Pressure - APc
  {name: 'APEc', id: 56},
  {name: 'APFc', id: 57},
  {name: 'APGc', id: 58},
  // High Pressure - APR
  {name: 'APRF', id: 51},
  {name: 'APRG', id: 52},
  {name: 'APRH', id: 53},
  {name: 'APRI', id: 54},
  {name: 'APRL', id: 55},
  // High Pressure - APR/N8
  {name: 'APRF/N8', id: 998},
  {name: 'APRG/N8', id: 999},
  {name: 'APRH/N8', id: 1000},
  {name: 'APRI/N8', id: 1001},
  {name: 'APRL/N8', id: 1253},
  // High Pressure - APRc
  {name: 'APRFc', id: 59},
  {name: 'APRGc', id: 60},
  {name: 'APRHc', id: 61},
  {name: 'APRIc', id: 62},
  {name: 'APRLc', id: 63},
  // High Pressure - APRD
  {name: 'APRED', id: 1075},
  {name: 'APRFD', id: 1076},
  {name: 'APRGD', id: 1077},
  // Medium Pressure
  {name: 'EU', id: 16},
  {name: 'EUc', id: 17},
  {name: 'EUM', id: 18},
  {name: 'EUK', id: 1297},
  {name: 'EUKc', id: 1298},
  {name: 'EUMc', id: 19},
  {name: 'MPR', id: 20},
  {name: 'MPRc', id: 1278},
  {name: 'TF', id: 23},
  {name: 'TFc', id: 21},
  {name: 'TG', id: 24},
  {name: 'TGc', id: 22},
  {name: 'TH', id: 25},
  {name: 'THc', id: 1240},
  {name: 'TPA', id: 27},
  {name: 'TPALc', id: 26},
  {name: 'TQ', id: 28},
  {name: 'TR', id: 30},
  {name: 'TRc', id: 31},
  {name: 'TTRc', id: 29},
  // Low Pressure
  {name: 'BP', id: 32},
  {name: 'BPc', id: 34},
  {name: 'BPR', id: 33},
  {name: 'BPRc', id: 35},
  {name: 'BPRDc', id: 36},
  {name: 'BT', id: 1296},
  // Axials
  {name: 'EVc', id: 40},
  {name: 'EVF', id: 38},
  {name: 'EVL', id: 39},
  {name: 'EVP', id: 37},
  {name: 'EVT', id: 41},
];

function ajaxPost(payload) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const options = {
      hostname: 'livecurve.euroventilatori-int.com',
      path: AJAX_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Cookie': COOKIE,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://livecurve.euroventilatori-int.com/en/industrial-fans/000048-high-pressure-ap-ape/',
        'X-Requested-With': 'XMLHttpRequest',
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function getFans(serieId) {
  const resp = await ajaxPost({
    RequestInput: { Action: 'fans' },
    Serie: { ID: serieId }
  });
  return resp.Fans || [];
}

async function getFanSpecs(fanId) {
  const resp = await ajaxPost({
    RequestInput: { Action: 'fan' },
    Fan: { ID: fanId }
  });
  return resp;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const outputFile = path.join(DATA_DIR, 'all_fans_specs.json');
  let allData = {};
  
  // Load existing data if any
  if (fs.existsSync(outputFile)) {
    try {
      allData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      console.log(`Loaded existing data: ${Object.keys(allData).length} series`);
    } catch(e) {
      allData = {};
    }
  }
  
  let totalFans = 0;
  let totalSeries = 0;
  
  for (const serie of ALL_SERIES) {
    if (allData[serie.name] && allData[serie.name].complete) {
      console.log(`Skipping ${serie.name} (already complete: ${allData[serie.name].models.length} models)`);
      totalFans += allData[serie.name].models.length;
      totalSeries++;
      continue;
    }
    
    console.log(`\nProcessing series: ${serie.name} (ID: ${serie.id})`);
    
    // Get list of fans for this series
    const fans = await getFans(serie.id);
    console.log(`  Found ${fans.length} models`);
    
    if (fans.length === 0) {
      console.log(`  WARNING: No fans found for series ${serie.name}`);
      continue;
    }
    
    allData[serie.name] = {
      id: serie.id,
      models: [],
      complete: false
    };
    
    // Get specs for each fan
    for (let i = 0; i < fans.length; i++) {
      const fan = fans[i];
      const fanId = parseInt(fan.ID);
      
      process.stdout.write(`  [${i+1}/${fans.length}] ${fan.Name_Euro}... `);
      
      try {
        const specs = await getFanSpecs(fanId);
        
        if (specs.Fan) {
          const f = specs.Fan;
          allData[serie.name].models.push({
            id: fanId,
            name: f.Name || fan.Name_Euro,
            flowMin_m3min: f.MinFanDelivery,
            flowMax_m3min: f.MaxFanDelivery,
            flowMin_m3h: Math.round(f.MinFanDelivery * 60),
            flowMax_m3h: Math.round(f.MaxFanDelivery * 60),
            pSuctionMin: f.MinFanSuctionPressure,
            pSuctionMax: f.MaxFanSuctionPressure,
            pDischargeMin: f.MinFanDischargePressure,
            pDischargeMax: f.MaxFanDischargePressure,
            motorCode: f.MotorCode,
            motorPoles: f.MotorPoles,
            motorPower_kw: f.MotorPower,
            speedMeasured: f.MeasuredSpeed,
            speedLimit: f.LimitSpeed,
            airType: f.AirType,
            flange_inlet_mm: f.FlAsp,
            flange_outlet_mm: [f.FlPrem1, f.FlPrem2],
            weight_kg: f.Weight,
            pd2: f.PD2,
          });
          process.stdout.write(`OK (${f.MinFanDelivery}-${f.MaxFanDelivery} m³/min, ${f.MinFanDischargePressure}-${f.MaxFanDischargePressure} kg/m²)\n`);
        } else {
          process.stdout.write(`No data\n`);
          allData[serie.name].models.push({
            id: fanId,
            name: fan.Name_Euro,
            error: 'No specs returned'
          });
        }
      } catch(e) {
        process.stdout.write(`ERROR: ${e.message}\n`);
        allData[serie.name].models.push({
          id: fanId,
          name: fan.Name_Euro,
          error: e.message
        });
      }
      
      await sleep(200); // Rate limiting
    }
    
    allData[serie.name].complete = true;
    totalFans += fans.length;
    totalSeries++;
    
    // Save progress after each series
    fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));
    console.log(`  Saved progress: ${totalSeries} series, ${totalFans} total fans`);
    
    await sleep(500);
  }
  
  console.log(`\n=== EXTRACTION COMPLETE ===`);
  console.log(`Total series: ${totalSeries}`);
  console.log(`Total fans: ${totalFans}`);
  console.log(`Output: ${outputFile}`);
  
  // Generate summary
  const summary = {
    extractionDate: new Date().toISOString(),
    totalSeries: totalSeries,
    totalModels: totalFans,
    series: {}
  };
  
  for (const [name, data] of Object.entries(allData)) {
    summary.series[name] = {
      count: data.models.length,
      complete: data.complete
    };
  }
  
  fs.writeFileSync(path.join(DATA_DIR, 'extraction_summary.json'), JSON.stringify(summary, null, 2));
  console.log('Summary saved!');
}

main().catch(console.error);
