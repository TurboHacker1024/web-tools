'use strict';

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

// Theme toggle (switch)
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

  if (supportsMedia) {
    if (media.addEventListener) {
      media.addEventListener('change', (e)=>{ if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light'); });
    } else if (media.addListener) {
      media.addListener((e)=>{ if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light'); });
    }
  }
})();

// Dismissible contact banner
(function(){
  const banner = document.getElementById('contact-banner');
  if (!banner) return; // only on contact page
  const btn = document.getElementById('dismiss-banner');
  // Always show banner on new visits — clear any previous persistence
  try { localStorage.removeItem('contact_banner_dismissed'); } catch {}
  if (btn) {
    btn.addEventListener('click', () => {
      banner.style.display = 'none'; // hide for current view only
    });
  }
})();
