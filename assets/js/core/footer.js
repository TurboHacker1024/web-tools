'use strict';

// Injects the shared footer into every page.
// - If a <footer> exists, it replaces it with the shared partial
// - Otherwise, it appends the shared footer at the end of <body>
(async function injectSharedFooter(){
  try {
    const res = await fetch('partials/footer.html', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Try robust parse: look for an explicit <footer> element inside the fetched doc.
    let shared = null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      shared = doc.querySelector('footer');
    } catch {}
    if (!shared) {
      // Fallback: treat as raw fragment
      const tpl = document.createElement('template');
      tpl.innerHTML = html.trim();
      // Prefer a <footer> node if present, else first element
      shared = tpl.content.querySelector('footer') || tpl.content.firstElementChild;
    }
    if (!shared) return;

    const existing = document.querySelector('footer#site-footer') || document.querySelector('footer');
    if (existing) {
      existing.replaceWith(shared);
    } else {
      document.body.appendChild(shared);
    }
  } catch (err) {
    // Non-fatal: keep any existing footer as-is
    console.error('Failed to load shared footer:', err);
  }
})();
