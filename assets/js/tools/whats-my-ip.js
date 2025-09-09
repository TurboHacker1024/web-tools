'use strict';

(function(){
  const ipEl = document.getElementById('ip-value');
  const noteEl = document.getElementById('ip-note');
  const copyBtn = document.getElementById('copy-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  const endpoints = [
    { url: 'https://api.ipify.org?format=json', parse: async (r)=> (await r.json()).ip },
    { url: 'https://ifconfig.co/json', parse: async (r)=> (await r.json()).ip },
    { url: 'https://api.my-ip.io/ip.json', parse: async (r)=> (await r.json()).ip },
    { url: 'https://api.seeip.org/jsonip', parse: async (r)=> (await r.json()).ip },
    { url: 'https://api.ip.sb/ip', parse: async (r)=> (await r.text()).trim() },
    { url: 'https://www.cloudflare.com/cdn-cgi/trace', parse: async (r)=> {
        const t = await r.text();
        const line = t.split('\n').find(l => l.startsWith('ip='));
        return line ? line.slice(3).trim() : '';
      }
    }
  ];

  function isValidIp(s){
    // Very tolerant IPv4/IPv6 check
    if (!s || typeof s !== 'string') return false;
    const v4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    const v6 = /^[0-9a-f:]+$/i;
    return v4.test(s) || v6.test(s);
  }

  async function withTimeout(promise, ms){
    let to;
    const t = new Promise((_, rej)=> to = setTimeout(()=> rej(new Error('timeout')), ms));
    try { return await Promise.race([promise, t]); }
    finally { clearTimeout(to); }
  }

  async function fetchIp(){
    ipEl.textContent = '—';
    noteEl.textContent = 'Detecting…';
    copyBtn.disabled = true;
    for (const ep of endpoints){
      try {
        const res = await withTimeout(fetch(ep.url, { cache: 'no-store' }), 5000);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const ip = await ep.parse(res);
        if (isValidIp(ip)) {
          ipEl.textContent = ip;
          noteEl.textContent = 'Public IP detected';
          copyBtn.disabled = false;
          return ip;
        }
      } catch (e) {
        // try next
      }
    }
    noteEl.textContent = 'Unable to detect your IP. Please try Refresh.';
  }

  copyBtn.addEventListener('click', async ()=>{
    const text = ipEl.textContent || '';
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied!'; setTimeout(()=> copyBtn.textContent='Copy', 1200); }
    catch { /* ignore */ }
  });
  refreshBtn.addEventListener('click', ()=>{ fetchIp(); });

  // Initial load
  fetchIp();
})();

