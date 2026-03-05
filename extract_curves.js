// LiveCurve SVG Extraction Script
// Formula: flow = fMin * pow(fMax/fMin, (svgX - xMin) / (xMax - xMin)) * 60
// pressure = pMin * pow(pMax/pMin, (yMax - svgY) / (yMax - yMin))

const SERIES_TO_EXTRACT = [
  // APc variants
  'APEc', 'APFc', 'APGc',
  // APR N8 and variants
  'APR./N8', 'APRc', 'APRD',
  // Medium pressure "c" variants
  'EUc', 'EUKc', 'EUMc', 'MPRc', 'TFc', 'TGc', 'THc', 'TPALc', 'TRc', 'TTRc',
  // Low pressure "c" variants
  'BPc', 'BPRc', 'BPRDc',
  // Axials remaining
  'EVP', 'EVT', 'EVc'
];

// Extraction function to run in browser console
async function extractSeriesCurves(seriesName) {
  const results = [];
  const select = document.querySelector('select');
  if (!select) return { error: 'No select found' };
  
  const options = Array.from(select.options);
  
  for (let i = 0; i < options.length; i++) {
    select.selectedIndex = i;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Wait for iframe to load
    await new Promise(r => setTimeout(r, 400));
    
    const iframe = document.querySelector('iframe');
    if (!iframe || !iframe.contentDocument) continue;
    
    const svg = iframe.contentDocument.querySelector('svg');
    if (!svg) continue;
    
    const polylines = svg.querySelectorAll('polyline');
    const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
    
    // Extract axis ranges from text labels
    const flowLabels = texts.filter(t => /^\d+$/.test(t) && parseInt(t) >= 1);
    const pressLabels = texts.filter(t => /^\d+$/.test(t) && parseInt(t) >= 10);
    
    results.push({
      model: options[i].text,
      totalCurve: polylines[0]?.getAttribute('points')?.substring(0, 200),
      staticCurve: polylines[1]?.getAttribute('points')?.substring(0, 200),
      axisLabels: texts.slice(0, 15)
    });
  }
  
  return { series: seriesName, models: results };
}

// Export for node/browser
if (typeof module !== 'undefined') module.exports = { extractSeriesCurves, SERIES_TO_EXTRACT };
