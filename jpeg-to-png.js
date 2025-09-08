'use strict';

// Small DOM helpers
const $ = (sel) => document.querySelector(sel);

// Elements
const dz = $('#dropzone');
const fileInput = $('#file-input');
const altFileInput = $('#file-input-any');
const browseBtn = $('#browse-btn');
const browseAltBtn = $('#browse-alt-btn');
const convertBtn = $('#convert-btn');
const convertLabel = $('#convert-label');
const convertSpin = $('#convert-spin');

const previewBox = $('#preview');
const previewImg = $('#preview-img');
const fileNameEl = $('#file-name');
const fileSizeEl = $('#file-size');
const fileTypeEl = $('#file-type');

const panel = $('#convert-panel');
const progress = $('#progress');
const progressBar = $('#progress-bar');
const progressText = $('#progress-text');
const resultNote = $('#result-note');
const downloadBtn = $('#download-btn');
const resetBtn = $('#reset-btn');

let selectedFile = null;
let objectUrl = null;
let outputUrl = null;

// Env detection to prefer the alternate picker on Android (to avoid photo picker stripping metadata/file type)
const isMobile = () => {
  const ua = (navigator.userAgent || '').toLowerCase();
  const uaDataMobile = navigator.userAgentData && navigator.userAgentData.mobile;
  return !!(uaDataMobile || /android|iphone|ipad|ipod|iemobile|mobile|blackberry|bb10|opera mini/.test(ua));
};
const preferAltPicker = isMobile();

function bytes(n){
  if (!Number.isFinite(n)) return '—';
  const u=['B','KB','MB','GB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;}
  return `${n.toFixed(n<10&&i>0?1:0)} ${u[i]}`;
}

function setProgress(pct, text){
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  progress.setAttribute('aria-valuenow', String(v));
  progressBar.style.width = v + '%';
  if (text) progressText.textContent = text;
}

function resetUI(){
  // revoke any old blobs
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  if (outputUrl) { URL.revokeObjectURL(outputUrl); outputUrl = null; }
  previewBox.style.display = 'none';
  panel.style.display = 'none';
  downloadBtn.style.display = 'none';
  resultNote.style.display = 'none';
  convertBtn.disabled = !selectedFile;
  convertLabel.style.display = '';
  convertSpin.style.display = 'none';
  setProgress(0, 'Waiting to convert…');
}

function setFile(file){
  selectedFile = file;
  if (!file) { resetUI(); return; }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  previewImg.src = objectUrl;
  previewImg.onload = () => URL.revokeObjectURL(objectUrl);
  fileNameEl.textContent = file.name || 'image.jpg';
  fileSizeEl.textContent = `· ${bytes(file.size)}`;
  fileTypeEl.textContent = file.type ? `· ${file.type}` : '';
  previewBox.style.display = 'block';
  panel.style.display = 'block';
  convertBtn.disabled = false;
  downloadBtn.style.display = 'none';
  resultNote.style.display = 'none';
  setProgress(0, 'Ready');
}

function isJpeg(file){
  const name=(file.name||'').toLowerCase();
  const type=(file.type||'').toLowerCase();
  return type==='image/jpeg' || /\.jpe?g$/.test(name);
}

// Dropzone behavior
dz.addEventListener('dragenter', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', ()=>dz.classList.remove('dragover'));
dz.addEventListener('drop', (e)=>{
  e.preventDefault(); dz.classList.remove('dragover');
  const f = e.dataTransfer?.files?.[0];
  if (f) handleIncoming(f);
});
dz.addEventListener('click', (e)=>{
  const interactive = e.target.closest('button, a, input, label, summary, details');
  if (!interactive) (preferAltPicker && altFileInput ? altFileInput : fileInput).click();
});
dz.addEventListener('keydown', (e)=>{
  if (e.target !== dz) return;
  if (e.key==='Enter' || e.key===' ') { e.preventDefault(); (preferAltPicker && altFileInput ? altFileInput : fileInput).click(); }
});
window.addEventListener('dragover', (e)=>{ if (e.dataTransfer && Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });
window.addEventListener('drop', (e)=>{ if (e.dataTransfer && Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });

browseBtn.addEventListener('click', (e)=>{ e.stopPropagation(); fileInput.click(); });
browseAltBtn.addEventListener('click', (e)=>{ e.stopPropagation(); altFileInput && altFileInput.click(); });
fileInput.addEventListener('change', ()=>{ const f=fileInput.files?.[0]; if (f) handleIncoming(f); });
altFileInput.addEventListener('change', ()=>{ const f=altFileInput.files?.[0]; if (f) handleIncoming(f); });

function handleIncoming(file){
  if (!isJpeg(file)) { alert('Please choose a JPEG (.jpg/.jpeg) image.'); return; }
  setFile(file);
}

// Conversion
async function readOrientation(file){
  try {
    if (typeof exifr === 'undefined' || !exifr?.parse) return undefined;
    const data = await exifr.parse(file, { ifd0:true, exif:false, tiff:true, pick: ['Orientation'] });
    return data?.Orientation;
  } catch { return undefined; }
}

function applyOrientation(canvas, ctx, orientation, width, height){
  // Reference: EXIF orientation spec (1..8)
  switch(orientation){
    case 2: // mirror X
      ctx.translate(width, 0); ctx.scale(-1, 1); break;
    case 3: // 180
      ctx.translate(width, height); ctx.rotate(Math.PI); break;
    case 4: // mirror Y
      ctx.translate(0, height); ctx.scale(1, -1); break;
    case 5: // mirror X + 90 CW
      canvas.width = height; canvas.height = width;
      ctx.translate(height, 0); ctx.rotate(Math.PI/2); ctx.scale(-1,1); return;
    case 6: // 90 CW
      canvas.width = height; canvas.height = width;
      ctx.translate(height, 0); ctx.rotate(Math.PI/2); return;
    case 7: // mirror X + 270 CW
      canvas.width = height; canvas.height = width;
      ctx.translate(0, width); ctx.rotate(-Math.PI/2); ctx.scale(-1,1); return;
    case 8: // 270 CW
      canvas.width = height; canvas.height = width;
      ctx.translate(0, width); ctx.rotate(-Math.PI/2); return;
    default:
      // 1 (normal)
      break;
  }
}

async function decodeToBitmap(file){
  // Prefer ImageBitmap for speed if supported
  if ('createImageBitmap' in window) {
    return await createImageBitmap(file);
  }
  return await new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e)=>{ URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function drawToCanvas(src, orientation){
  const w = src.width || src.naturalWidth; const h = src.height || src.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // If orientation swaps dimensions, applyOrientation will update canvas size first
  applyOrientation(canvas, ctx, orientation, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

async function convert(file){
  convertBtn.disabled = true; convertLabel.style.display = 'none'; convertSpin.style.display = '';
  setProgress(5, 'Decoding image…');
  let timer;
  try {
    const orientation = await readOrientation(file); setProgress(20, 'Decoding image…');
    const bmp = await decodeToBitmap(file); setProgress(45, 'Rendering…');
    const canvas = drawToCanvas(bmp, orientation || 1);

    // Animate progress while encoding (toBlob has no progress events)
    let p = 50; timer = setInterval(()=>{ p = Math.min(90, p + 2); setProgress(p); }, 120);
    const blob = await new Promise((resolve, reject)=> canvas.toBlob(b => b? resolve(b): reject(new Error('toBlob failed')), 'image/png'));
    if (timer) clearInterval(timer);
    setProgress(100, 'Done');

    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    const base = (file.name || 'image').replace(/\.[^.]+$/,'');
    downloadBtn.href = outputUrl;
    downloadBtn.download = `${base}.png`;
    downloadBtn.style.display = '';
    resultNote.textContent = `Converted to PNG • ${bytes(blob.size)}`;
    resultNote.style.display = 'block';
  } catch (err) {
    if (timer) clearInterval(timer);
    console.error(err);
    alert('Sorry, conversion failed. Try a different JPEG.');
    setProgress(0, 'Waiting to convert…');
  } finally {
    convertSpin.style.display = 'none'; convertLabel.style.display = ''; convertBtn.disabled = false;
  }
}

convertBtn.addEventListener('click', async (e)=>{ e.stopPropagation(); if (selectedFile) await convert(selectedFile); });
resetBtn.addEventListener('click', ()=>{ selectedFile = null; resetUI(); fileInput.value=''; if (altFileInput) altFileInput.value=''; });

// Initialize
resetUI();

// Mobile menu + theme toggles (reuse same small helpers from site.js)
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
(function(){
  const root = document.documentElement;
  const btnDesktop = document.getElementById('theme-toggle');
  const btnMobile = document.getElementById('theme-toggle-mobile');
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const saved = localStorage.getItem('theme');
  const supportsMedia = !!(media && typeof media.matches === 'boolean');
  const initial = saved || (supportsMedia ? (media.matches ? 'dark' : 'light') : 'light');
  setTheme(initial);
  function setTheme(mode){ root.setAttribute('data-theme', mode); localStorage.setItem('theme', mode); const checked = mode === 'dark'; if (btnDesktop) btnDesktop.checked = checked; if (btnMobile) btnMobile.checked = checked; }
  const update = (e)=> setTheme(e.currentTarget.checked ? 'dark' : 'light');
  btnDesktop && btnDesktop.addEventListener('change', update);
  btnMobile && btnMobile.addEventListener('change', update);
  if (media) {
    if (media.addEventListener) media.addEventListener('change', (e)=>{ if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light'); });
    else if (media.addListener) media.addListener((e)=>{ if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light'); });
  }
})();

