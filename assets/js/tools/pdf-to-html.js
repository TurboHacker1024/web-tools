// PDF → HTML (Static Page) Tool
// Renders each PDF page to an image and builds a standalone HTML file with embedded data URIs.

(function(){
  'use strict';

  // Elements
  const dz = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const altFileInput = document.getElementById('file-input-any');
  const browseBtn = document.getElementById('browse-btn');
  const browseAltBtn = document.getElementById('browse-alt-btn');
  const convertBtn = document.getElementById('convert-btn');
  const convertLabel = document.getElementById('convert-label');
  const convertSpin = document.getElementById('convert-spin');
  const preview = document.getElementById('preview');
  const previewCanvas = document.getElementById('preview-canvas');
  const fileNameEl = document.getElementById('file-name');
  const fileSizeEl = document.getElementById('file-size');
  const fileTypeEl = document.getElementById('file-type');
  const convertPanel = document.getElementById('convert-panel');
  const progress = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const downloadBtn = document.getElementById('download-btn');
  const resetBtn = document.getElementById('reset-btn');
  const resultNote = document.getElementById('result-note');
  const formatSel = document.getElementById('format');
  const qualityRange = document.getElementById('quality');
  const scaleSel = document.getElementById('scale');
  const maxPagesInput = document.getElementById('max-pages');

  let selectedFile = null;
  let outputUrl = null;
  const preferAltPicker = !('showOpenFilePicker' in window) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  function bytes(n){
    if (!Number.isFinite(n)) return '—';
    const u=['B','KB','MB','GB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(n>=1024?1:0)} ${u[i]}`;
  }

  function setProgress(pct, text){
    const val = Math.max(0, Math.min(100, Math.round(pct||0)));
    progressBar.style.width = `${val}%`;
    progress.setAttribute('aria-valuenow', String(val));
    progressText.textContent = text || `${val}%`;
  }

  function resetUI(){
    if (outputUrl) { URL.revokeObjectURL(outputUrl); outputUrl = null; }
    fileNameEl.textContent = '—'; fileSizeEl.textContent=''; fileTypeEl.textContent='';
    preview.style.display = 'none';
    convertPanel.style.display = 'block';
    convertBtn.disabled = true; downloadBtn.style.display = 'none'; resultNote.style.display='none';
    const ctx = previewCanvas.getContext('2d'); ctx?.clearRect(0,0,previewCanvas.width, previewCanvas.height);
    setProgress(0, 'Waiting to convert…');
  }

  function isPdf(file){
    const name=(file.name||'').toLowerCase();
    const type=(file.type||'').toLowerCase();
    return type==='application/pdf' || name.endsWith('.pdf');
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

  async function handleIncoming(file){
    if (!isPdf(file)) { alert('Please choose a PDF (.pdf) file.'); return; }
    selectedFile = file;
    fileNameEl.textContent = file.name || 'document.pdf';
    fileSizeEl.textContent = `• ${bytes(file.size)}`;
    fileTypeEl.textContent = (file.type||'').replace('application/','') || 'pdf';
    convertBtn.disabled = false;
    convertPanel.style.display = 'block';
    preview.style.display = 'none';

    // Render a low-cost preview of page 1
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.6 });
      const canvas = previewCanvas;
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      // Keep preview small and tidy
      canvas.style.width = '110px';
      canvas.style.height = 'auto';
      canvas.style.border = '1px solid var(--border)';
      canvas.style.borderRadius = '10px';
      preview.style.display = '';
      pdf.cleanup();
    } catch (err) {
      console.warn('Preview render failed:', err);
      preview.style.display = 'none';
    }
  }

  // Conversion
  async function convert(file){
    convertBtn.disabled = true; convertLabel.style.display = 'none'; convertSpin.style.display = '';
    setProgress(2, 'Reading PDF…');
    let pdf, timer;
    try {
      const t0 = performance.now();
      const buf = await file.arrayBuffer();
      pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const total = pdf.numPages;

      const maxPages = Math.max(0, parseInt(maxPagesInput.value || '0', 10) || 0);
      const pagesToDo = maxPages > 0 ? Math.min(maxPages, total) : total;

      setProgress(5, `Extracting text from ${pagesToDo} page${pagesToDo!==1?'s':''}…`);


      // Build text-based HTML content with basic formatting
      setProgress(98, 'Extracting text…');
      // Derive filenames and document title (PDF metadata if available)
      const rawTitle = (file.name || 'document').replace(/\.[^.]+$/,'');
      let docTitle = rawTitle;
      try {
        const meta = await pdf.getMetadata();
        if (meta.info && meta.info.Title) docTitle = meta.info.Title;
      } catch (_) {}
      // Collect text per page, grouping into paragraphs of line objects
      const pagesText = [];
      for (let i = 1; i <= pagesToDo; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // Group items into lines by rounded y-coordinate
        const linesMap = new Map();
        textContent.items.forEach(item => {
          const y = item.transform[5];
          const key = Math.round(y / 10) * 10;
          if (!linesMap.has(key)) linesMap.set(key, []);
          linesMap.get(key).push(item);
        });
        // Sort lines top-to-bottom (y descending)
        const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);
        // Build line objects with text and average font size
        const lines = sortedYs.map(y => {
          const items = linesMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
          const text = items.map(it => it.str).join(' ');
          const size = items.reduce((sum, it) => sum + it.transform[3], 0) / items.length;
          return { text: text.trim(), size };
        });
        // Merge lines into paragraphs
        const paragraphs = [];
        let curr = [];
        lines.forEach(line => {
          if (!line.text) {
            if (curr.length) { paragraphs.push(curr); curr = []; }
          } else {
            curr.push(line);
          }
        });
        if (curr.length) paragraphs.push(curr);
        pagesText.push({ index: i, paragraphs });
      }
      setProgress(99, 'Packaging HTML…');
      const html = buildStandaloneHtml(docTitle, pagesText);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = URL.createObjectURL(blob);
      downloadBtn.href = outputUrl;
      downloadBtn.download = `${rawTitle}.html`;
      downloadBtn.style.display = '';

      const tMs = Math.max(1, Math.round(performance.now()-t0));
      resultNote.textContent = `Done • ${pagesText.length} page${pagesText.length!==1?'s':''} • ${bytes(blob.size)} • ${tMs} ms`;
      resultNote.style.display = 'block';
      setProgress(100, 'Done');
    } catch (err) {
      console.error(err);
      alert('Sorry, conversion failed. Try a smaller or different PDF.');
      setProgress(0, 'Waiting to convert…');
    } finally {
      convertSpin.style.display = 'none'; convertLabel.style.display = ''; convertBtn.disabled = false;
      try { pdf && pdf.cleanup && pdf.cleanup(); } catch {}
    }
  }

  /**
   * Build a standalone HTML with formatted text per page.
   * pagesText: Array<{index:number, paragraphs:Array<{text:string,size:number}>}>
   */
  function buildStandaloneHtml(title, pagesText) {
    const esc = s => String(s||'').replace(/[&<>\u2028\u2029]/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','\u2028':'\\u2028','\u2029':'\\u2029'}[c]||c)
    );
    // Build pages with headings and formatted paragraphs
    const pages = pagesText.map(page => {
      // Determine heading font sizes by unique line sizes
      const allSizes = page.paragraphs.flat().map(l => l.size);
      const uniqueSizes = Array.from(new Set(allSizes)).sort((a, b) => b - a);
      const h1Size = uniqueSizes[0] || 0;
      const h2Size = uniqueSizes[1] || 0;
      // Build blocks per paragraph
      const blocks = page.paragraphs.map(para => {
        if (para.length === 1 && para[0].size === h1Size) {
          return `      <h1>${esc(para[0].text)}</h1>`;
        } else if (para.length === 1 && para[0].size === h2Size) {
          return `      <h2>${esc(para[0].text)}</h2>`;
        } else {
          const text = para.map(l => l.text).join(' ');
          return `      <p>${esc(text)}</p>`;
        }
      }).join('\n');
      return `
    <section class="page" data-index="${page.index}">
${blocks}
    </section>`;
    }).join('');
    const style = `/* Basic styling */
:root{ color-scheme: light dark; }
html,body{ margin:0; padding:0; }
body{ font-family: system-ui, sans-serif; line-height:1.5; }
.header{ position:sticky; top:0; padding:12px; background:#fff; border-bottom:1px solid #ccc; }
.header h1{ margin:0; }
.header h1 small{ font-size:0.8em; color:#666; }
.doc{ width: min(100%,800px); margin:16px auto; padding:16px; }
.page{ margin-bottom:32px; }
.page h1{ font-size:1.5em; margin:0 0 0.5em; }
.page h2{ font-size:1.2em; margin:1em 0 0.5em; }
.page p{ margin:0 0 1em; }
footer{ text-align:center; font-size:12px; color:#666; margin:32px 0; }
@media print{ .header, footer{ display:none } .doc{ margin:0; padding:0 } .page{ page-break-after:always } }`;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${esc(title)} — Text PDF</title>
    <style>${style}</style>
  </head>
  <body>
    <div class="header"><h1>${esc(title)} <small>(PDF → HTML)</small></h1></div>
    <main class="doc">${pages}
    </main>
    <footer>Generated locally · ${new Date().toISOString()}</footer>
  </body>
</html>`;
  }

  convertBtn.addEventListener('click', async (e)=>{ e.stopPropagation(); if (selectedFile) await convert(selectedFile); });
  resetBtn.addEventListener('click', ()=>{ selectedFile = null; resetUI(); fileInput.value=''; if (altFileInput) altFileInput.value=''; });

  // Initialize
  resetUI();
  // Disable JPEG quality when PNG is selected
  const syncQualityState = ()=>{
    const isPng = (formatSel.value||'jpeg').toLowerCase()==='png';
    qualityRange.disabled = isPng;
    qualityRange.style.opacity = isPng ? '0.6' : '1';
  };
  syncQualityState();
  formatSel.addEventListener('change', syncQualityState);

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
})();
