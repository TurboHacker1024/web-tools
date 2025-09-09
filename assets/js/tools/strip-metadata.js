'use strict';

// Helpers
const $ = (sel) => document.querySelector(sel);
const bytes = (n)=>{
  if (!Number.isFinite(n)) return '—';
  const u=['B','KB','MB','GB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;}
  return `${n.toFixed(n<10&&i>0?1:0)} ${u[i]}`;
};

// Elements
const dz = $('#dropzone');
const fileInput = $('#file-input');
const altFileInput = $('#file-input-any');
const browseBtn = $('#browse-btn');
const browseAltBtn = $('#browse-alt-btn');
const cleanBtn = $('#clean-btn');
const cleanLabel = $('#clean-label');
const cleanSpin = $('#clean-spin');

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

const isMobile = () => {
  const ua = (navigator.userAgent || '').toLowerCase();
  const uaDataMobile = navigator.userAgentData && navigator.userAgentData.mobile;
  return !!(uaDataMobile || /android|iphone|ipad|ipod|iemobile|mobile|blackberry|bb10|opera mini/.test(ua));
};
const preferAltPicker = isMobile();

function setProgress(pct, text){
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  progress.setAttribute('aria-valuenow', String(v));
  progressBar.style.width = v + '%';
  if (text) progressText.textContent = text;
}

function resetUI(){
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  if (outputUrl) { URL.revokeObjectURL(outputUrl); outputUrl = null; }
  previewBox.style.display = 'none';
  panel.style.display = 'none';
  downloadBtn.style.display = 'none';
  resultNote.style.display = 'none';
  cleanBtn.disabled = !selectedFile;
  cleanLabel.style.display = '';
  cleanSpin.style.display = 'none';
  setProgress(0, 'Waiting…');
}

function setFile(file){
  selectedFile = file;
  if (!file) { resetUI(); return; }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  previewImg.src = objectUrl;
  previewImg.onload = () => URL.revokeObjectURL(objectUrl);
  fileNameEl.textContent = file.name || 'image';
  fileSizeEl.textContent = `· ${bytes(file.size)}`;
  fileTypeEl.textContent = file.type ? `· ${file.type}` : '';
  previewBox.style.display = 'block';
  panel.style.display = 'block';
  cleanBtn.disabled = false;
  downloadBtn.style.display = 'none';
  resultNote.style.display = 'none';
  setProgress(0, 'Ready');
}

// read EXIF orientation (if exifr present)
async function readOrientation(file){
  try {
    if (typeof exifr === 'undefined' || !exifr?.parse) return undefined;
    const data = await exifr.parse(file, { ifd0:true, exif:false, tiff:true, pick:['Orientation'] });
    return data?.Orientation;
  } catch { return undefined; }
}

function applyOrientation(canvas, ctx, orientation, width, height){
  switch(orientation){
    case 2: ctx.translate(width, 0); ctx.scale(-1, 1); break;
    case 3: ctx.translate(width, height); ctx.rotate(Math.PI); break;
    case 4: ctx.translate(0, height); ctx.scale(1, -1); break;
    case 5: canvas.width = height; canvas.height = width; ctx.translate(height, 0); ctx.rotate(Math.PI/2); ctx.scale(-1,1); return;
    case 6: canvas.width = height; canvas.height = width; ctx.translate(height, 0); ctx.rotate(Math.PI/2); return;
    case 7: canvas.width = height; canvas.height = width; ctx.translate(0, width); ctx.rotate(-Math.PI/2); ctx.scale(-1,1); return;
    case 8: canvas.width = height; canvas.height = width; ctx.translate(0, width); ctx.rotate(-Math.PI/2); return;
    default: break; // 1 normal
  }
}

async function decodeToBitmap(file){
  if ('createImageBitmap' in window) return await createImageBitmap(file);
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
  applyOrientation(canvas, ctx, orientation || 1, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

function pickOutputType(inputType){
  const supported = ['image/jpeg','image/png','image/webp'];
  if (supported.includes(inputType)) return inputType;
  // Safari historically lacks webp toBlob; PNG is safest
  return 'image/png';
}

async function clean(file){
  cleanBtn.disabled = true; cleanLabel.style.display = 'none'; cleanSpin.style.display = '';
  setProgress(10, 'Decoding…');
  let timer;
  try {
    const orientation = await readOrientation(file); setProgress(25, 'Decoding…');
    const bmp = await decodeToBitmap(file); setProgress(50, 'Rendering…');
    const canvas = drawToCanvas(bmp, orientation);

    let outType = pickOutputType((file.type||'').toLowerCase());
    let p = 55; timer = setInterval(()=>{ p = Math.min(90, p + 2); setProgress(p); }, 120);
    async function toBlobAsync(t){
      return await new Promise((resolve, reject)=> canvas.toBlob(b => b? resolve(b): reject(new Error('toBlob failed')), t));
    }
    let blob;
    try {
      blob = await toBlobAsync(outType);
    } catch {
      // Fallback to PNG if requested format not supported
      outType = 'image/png';
      blob = await toBlobAsync(outType);
    }
    if (timer) clearInterval(timer);
    setProgress(100, 'Done');

    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    const base = (file.name || 'image').replace(/\.[^.]+$/,'');
    const ext = outType==='image/jpeg'? 'jpg' : outType==='image/png'? 'png' : outType==='image/webp'? 'webp' : 'png';
    downloadBtn.href = outputUrl;
    downloadBtn.download = `${base}-clean.${ext}`;
    downloadBtn.style.display = '';
    const noteFmt = outType === (file.type||'').toLowerCase() ? 'same format' : `converted to ${ext.toUpperCase()}`;
    resultNote.textContent = `All metadata removed • ${bytes(blob.size)} • ${noteFmt}`;
    resultNote.style.display = 'block';
  } catch (err) {
    if (timer) clearInterval(timer);
    console.error(err);
    alert('Sorry, cleaning failed. Try a different image.');
    setProgress(0, 'Waiting…');
  } finally {
    cleanSpin.style.display = 'none'; cleanLabel.style.display = ''; cleanBtn.disabled = false;
  }
}

// Events
dz.addEventListener('dragenter', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
dz.addEventListener('drop', (e)=>{ e.preventDefault(); dz.classList.remove('dragover'); const f = e.dataTransfer?.files?.[0]; if (f) handleIncoming(f); });
dz.addEventListener('click', (e)=>{ const interactive = e.target.closest('button, a, input, label, summary, details'); if (!interactive) (preferAltPicker && altFileInput ? altFileInput : fileInput).click(); });
dz.addEventListener('keydown', (e)=>{ if (e.target!==dz) return; if (e.key==='Enter'||e.key===' ') { e.preventDefault(); (preferAltPicker && altFileInput ? altFileInput : fileInput).click(); } });
window.addEventListener('dragover', (e)=>{ if (e.dataTransfer && Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });
window.addEventListener('drop', (e)=>{ if (e.dataTransfer && Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });

browseBtn.addEventListener('click', (e)=>{ e.stopPropagation(); fileInput.click(); });
browseAltBtn.addEventListener('click', (e)=>{ e.stopPropagation(); altFileInput && altFileInput.click(); });
fileInput.addEventListener('change', ()=>{ const f=fileInput.files?.[0]; if (f) handleIncoming(f); });
altFileInput.addEventListener('change', ()=>{ const f=altFileInput.files?.[0]; if (f) handleIncoming(f); });

function isImage(file){
  const type=(file.type||'').toLowerCase();
  const name=(file.name||'').toLowerCase();
  return type.startsWith('image/') || /(jpe?g|png|webp|gif|bmp|tif|tiff|heic|heif)$/i.test(name);
}

function handleIncoming(file){
  if (!isImage(file)) { alert('Please choose an image file.'); return; }
  setFile(file);
}

cleanBtn.addEventListener('click', async (e)=>{ e.stopPropagation(); if (selectedFile) await clean(selectedFile); });
resetBtn.addEventListener('click', ()=>{ selectedFile = null; resetUI(); fileInput.value=''; if (altFileInput) altFileInput.value=''; });

// Init
resetUI();
