'use strict';

// Utility helpers
const $ = (sel) => document.querySelector(sel);
const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let b = bytes;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};
const formatDate = (d) => {
  if (!d) return '—';
  try {
    const date = (d instanceof Date) ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleString();
  } catch { return String(d); }
};
const fraction = (n) => {
  if (!n || !isFinite(n)) return '—';
  if (n >= 1) return n.toFixed(2).replace(/\.00$/, '');
  const den = Math.round(1 / n);
  return `1/${den}`;
};
const mapExposureProgram = (v) => ({
  0:'Not defined',1:'Manual',2:'Normal',3:'Aperture priority',4:'Shutter priority',5:'Creative',6:'Action',7:'Portrait',8:'Landscape'
})[v] || (v ?? '—');
const mapWhiteBalance = (v) => ({0:'Auto',1:'Manual'})[v] || (v ?? '—');
const mapMetering = (v) => ({
  0:'Unknown',1:'Average',2:'Center-weighted',3:'Spot',4:'Multi-spot',5:'Multi-segment',6:'Partial',255:'Other'
})[v] || (v ?? '—');
const mapOrientation = (v) => ({
  1:'Normal',2:'Mirror horizontal',3:'Rotate 180°',4:'Mirror vertical',5:'Mirror + rotate 90° CW',6:'Rotate 90° CW',7:'Mirror + rotate 270°',8:'Rotate 270°'
})[v] || (v ?? '—');
const flashFired = (val) => (typeof val === 'number' ? (val & 0x1) !== 0 : false);
const formatLatLng = (lat, lng) => {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '—';
  const hemiLat = lat >= 0 ? 'N' : 'S';
  const hemiLng = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${hemiLat}, ${Math.abs(lng).toFixed(6)}° ${hemiLng}`;
};

// DOM elements
const dz = $('#dropzone');
const fileInput = $('#file-input');
const browseBtn = $('#browse-btn');
const analyzeBtn = $('#analyze-btn');
const analyzeLabel = $('#analyze-label');
const analyzeSpin = $('#analyze-spin');

const previewBox = $('#preview');
const previewImg = $('#preview-img');
const fileNameEl = $('#file-name');
const fileSizeEl = $('#file-size');
const fileTypeEl = $('#file-type');

const resultsBox = $('#results');
const dateTakenEl = $('#date-taken');
const cameraEl = $('#camera');
const resolutionEl = $('#resolution');
const locationEl = $('#location');
const metaTable = $('#meta-table');
const rawJsonEl = $('#raw-json');
const copyJsonBtn = $('#copy-json');

let selectedFile = null;
let objectUrl = null;

function resetUI() {
  // Ensure hidden by setting explicit display values to override CSS
  previewBox.style.display = 'none';
  resultsBox.style.display = 'none';
  analyzeBtn.disabled = !selectedFile;
  analyzeLabel.style.display = '';
  analyzeSpin.style.display = 'none';
}

function setFile(file) {
  selectedFile = file;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (!file) { resetUI(); return; }
  objectUrl = URL.createObjectURL(file);
  previewImg.src = objectUrl;
  previewImg.onload = () => URL.revokeObjectURL(objectUrl);
  fileNameEl.textContent = file.name || 'image.jpg';
  fileSizeEl.textContent = `· ${formatBytes(file.size)}`;
  fileTypeEl.textContent = file.type ? `· ${file.type}` : '';
  // Explicitly show preview
  previewBox.style.display = 'block';
  analyzeBtn.disabled = false;
  // Hide previous results until analysis
  resultsBox.style.display = 'none';
}

// Dropzone events
dz.addEventListener('dragenter', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
dz.addEventListener('drop', (e) => {
  e.preventDefault(); dz.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleIncomingFile(file);
});
// Click and keyboard activation for better mobile/Firefox UX
dz.addEventListener('click', (e) => {
  // Only trigger picker when clicking non-interactive area of dropzone
  const interactive = e.target.closest('button, a, input, label, summary, details');
  if (!interactive) fileInput.click();
});
dz.addEventListener('keydown', (e) => {
  // Only when the dropzone itself is focused
  if (e.target !== dz) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
// Prevent opening file when dropped outside the zone
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
});

function handleIncomingFile(file) {
  if (!file) return;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  const isImageByMime = type.startsWith('image/');
  const isKnownExt = /(jpe?g|png|heic|heif|tif|tiff|webp|bmp|gif)$/i.test(name);
  if (!isImageByMime && !isKnownExt) {
    alert('Please provide an image file (JPEG, PNG, HEIC/HEIF, WebP, TIFF).');
    return;
  }
  setFile(file);
}

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) handleIncomingFile(f);
});

analyzeBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!selectedFile) return;
  analyzeBtn.disabled = true;
  analyzeLabel.style.display = 'none';
  analyzeSpin.style.display = '';
  try { await analyze(selectedFile); }
  catch (err) {
    console.error(err);
    alert('Sorry, something went wrong while reading metadata.');
  } finally {
    analyzeBtn.disabled = false;
    analyzeLabel.style.display = '';
    analyzeSpin.style.display = 'none';
  }
});

async function loadImageDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: undefined, height: undefined }); };
    img.src = url;
  });
}

function kvRow(key, value) {
  const row = document.createElement('div');
  row.className = 'row';
  const k = document.createElement('div');
  k.className = 'k';
  k.textContent = key;
  const v = document.createElement('div');
  v.textContent = value;
  row.appendChild(k); row.appendChild(v);
  return row;
}

function linkToMaps(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '—';
  const q = encodeURIComponent(`${lat},${lng}`);
  return `<a class="link" href="https://maps.google.com/?q=${q}" target="_blank" rel="noopener">Open in Google Maps</a>`;
}

function pickFirst(...vals) {
  return vals.find(v => v !== undefined && v !== null && v !== '') ?? undefined;
}

async function analyze(file) {
  // Read dimensions in parallel with metadata; be tolerant of unsupported formats
  const [dims, meta] = await Promise.all([
    loadImageDimensions(file),
    (async () => {
      try {
        return await exifr.parse(file, { tiff:true, ifd0:true, exif:true, gps:true, iptc:true, xmp:true, jfif:true, ihdr:true });
      } catch {
        return {};
      }
    })()
  ]);

  // Gather commonly used fields with fallbacks
  const dateOriginal = pickFirst(meta?.DateTimeOriginal, meta?.CreateDate, meta?.ModifyDate);
  const make = (meta?.Make || '').toString().trim();
  const model = (meta?.Model || '').toString().trim();
  const camera = [make, model].filter(Boolean).join(' ');
  const width = pickFirst(meta?.ExifImageWidth, meta?.ImageWidth, dims.width);
  const height = pickFirst(meta?.ExifImageHeight, meta?.ImageHeight, dims.height);

  // GPS handling
  let lat = meta?.latitude ?? meta?.Latitude ?? meta?.GPSLatitude;
  let lng = meta?.longitude ?? meta?.Longitude ?? meta?.GPSLongitude;
  const toDecimal = (arr) => {
    if (!Array.isArray(arr)) return arr;
    const [d=0,m=0,s=0] = arr.map(Number);
    return d + m/60 + s/3600;
  };
  lat = toDecimal(lat);
  lng = toDecimal(lng);
  if (typeof lat === 'number' && meta?.GPSLatitudeRef === 'S') lat = -Math.abs(lat);
  if (typeof lng === 'number' && meta?.GPSLongitudeRef === 'W') lng = -Math.abs(lng);

  // Headline stats
  dateTakenEl.textContent = formatDate(dateOriginal);
  cameraEl.textContent = camera || '—';
  resolutionEl.textContent = (width && height) ? `${width} × ${height}` : '—';
  locationEl.innerHTML = (typeof lat === 'number' && typeof lng === 'number')
    ? `${formatLatLng(lat, lng)} · ${linkToMaps(lat, lng)}`
    : '—';

  // Details table
  metaTable.innerHTML = '';
  const append = (key, val) => metaTable.appendChild(kvRow(key, val));

  const lens = pickFirst(meta?.LensModel, meta?.LensMake ? `${meta.LensMake} ${meta.LensModel || ''}`.trim() : undefined);
  const fnum = meta?.FNumber ? `f/${(+meta.FNumber).toFixed(1)}` : undefined;
  const expTime = meta?.ExposureTime ? `${fraction(+meta.ExposureTime)} sec` : (meta?.ShutterSpeedValue ? `${fraction(Math.pow(2, -meta.ShutterSpeedValue))} sec` : undefined);
  const iso = pickFirst(meta?.ISO, meta?.ISOSpeedRatings, meta?.PhotographicSensitivity);
  const focal = meta?.FocalLength ? `${(+meta.FocalLength).toFixed(0)} mm` : undefined;
  const focal35 = meta?.FocalLengthIn35mmFilm ? `${meta.FocalLengthIn35mmFilm} mm (35mm eq.)` : undefined;
  const ev = (typeof meta?.ExposureBiasValue === 'number') ? `${meta.ExposureBiasValue} EV` : undefined;
  const flash = (meta?.Flash !== undefined) ? (flashFired(meta.Flash) ? 'Fired' : 'Did not fire') + ` (0x${meta.Flash.toString(16)})` : undefined;
  const wb = meta?.WhiteBalance !== undefined ? mapWhiteBalance(meta.WhiteBalance) : undefined;
  const metering = meta?.MeteringMode !== undefined ? mapMetering(meta.MeteringMode) : undefined;
  const program = meta?.ExposureProgram !== undefined ? mapExposureProgram(meta.ExposureProgram) : undefined;
  const orientation = meta?.Orientation !== undefined ? mapOrientation(meta.Orientation) : undefined;
  const software = meta?.Software ? String(meta.Software) : undefined;
  const artist = meta?.Artist ? String(meta.Artist) : undefined;
  const copyright = meta?.Copyright ? String(meta.Copyright) : undefined;
  const gpsAlt = (typeof meta?.GPSAltitude === 'number') ? `${meta.GPSAltitude} m` : undefined;

  const iptcTitle = pickFirst(meta?.ObjectName, meta?.Title, meta?.DocumentTitle);
  const iptcDesc = pickFirst(meta?.Caption, meta?.CaptionAbstract, meta?.Description);
  const iptcKeywords = meta?.Keywords && Array.isArray(meta.Keywords) ? meta.Keywords.join(', ') : (meta?.Subject ? String(meta.Subject) : undefined);

  const rows = [
    ['Lens', lens],
    ['Aperture', fnum],
    ['Shutter Speed', expTime],
    ['ISO', iso],
    ['Focal Length', focal],
    ['35mm Equivalent', focal35],
    ['Exposure Comp.', ev],
    ['Exposure Program', program],
    ['Metering Mode', metering],
    ['White Balance', wb],
    ['Orientation', orientation],
    ['Flash', flash],
    ['Altitude', gpsAlt],
    ['Software', software],
    ['Artist', artist],
    ['Copyright', copyright],
    ['Title (IPTC/XMP)', iptcTitle],
    ['Description', iptcDesc],
    ['Keywords', iptcKeywords],
  ];

  for (const [k, v] of rows) {
    if (v !== undefined && v !== null && v !== '') append(k, String(v));
  }

  // Raw JSON output (pretty)
  try {
    const replacer = (key, value) => value instanceof ArrayBuffer ? `[ArrayBuffer ${value.byteLength}]` : value;
    const printed = (meta && Object.keys(meta).length) ? JSON.stringify(meta, replacer, 2) : 'No embedded metadata found.';
    rawJsonEl.textContent = printed;
  } catch { rawJsonEl.textContent = 'Unable to render metadata JSON.'; }

  // Explicitly show results after analysis
  resultsBox.style.display = 'block';
}

copyJsonBtn.addEventListener('click', async () => {
  const text = rawJsonEl.textContent || '';
  try {
    await navigator.clipboard.writeText(text);
    copyJsonBtn.textContent = 'Copied!';
    setTimeout(() => (copyJsonBtn.textContent = 'Copy JSON'), 1200);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); copyJsonBtn.textContent = 'Copied!'; } catch {}
    document.body.removeChild(ta);
    setTimeout(() => (copyJsonBtn.textContent = 'Copy JSON'), 1200);
  }
});

// Initialize
resetUI();
// Footer year
(function(){ const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear(); })();
// Mobile menu toggle
(function(){
  const btn = document.getElementById('menu-btn');
  const panel = document.getElementById('nav-panel');
  if (!btn || !panel) return;
  const close = () => { panel.classList.remove('open'); btn.setAttribute('aria-expanded','false'); };
  const toggle = () => { const open = panel.classList.toggle('open'); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e)=>{ if (!panel.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });
})();

// Theme toggle (light/dark)
(function(){
  const root = document.documentElement;
  const btnDesktop = document.getElementById('theme-toggle');
  const btnMobile = document.getElementById('theme-toggle-mobile');
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const saved = localStorage.getItem('theme');
  const supportsMedia = !!(media && typeof media.matches === 'boolean');
  const initial = saved || (supportsMedia ? (media.matches ? 'dark' : 'light') : 'light');
  setTheme(initial);

  function setTheme(mode){
    root.setAttribute('data-theme', mode);
    localStorage.setItem('theme', mode);
    const checked = mode === 'dark';
    if (btnDesktop) btnDesktop.checked = checked;
    if (btnMobile) btnMobile.checked = checked;
  }

  function updateFromInput(e){ setTheme(e.currentTarget.checked ? 'dark' : 'light'); }
  btnDesktop && btnDesktop.addEventListener('change', updateFromInput);
  btnMobile && btnMobile.addEventListener('change', updateFromInput);

  // If user has no explicit choice, react to OS changes
  if (supportsMedia) {
    if (media.addEventListener) {
      media.addEventListener('change', (e)=>{ if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light'); });
    } else if (media.addListener) {
      media.addListener((e)=>{ if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light'); });
    }
  }
})();
