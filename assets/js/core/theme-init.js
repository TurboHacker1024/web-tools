(function(){
  try {
    var root = document.documentElement;
    // Early UA detection for CSS-driven layout decisions (avoids flicker)
    try {
      var ua = (navigator.userAgent || '').toLowerCase();
      var isMobile = (navigator.userAgentData && navigator.userAgentData.mobile) || /android|iphone|ipad|ipod|iemobile|mobile|blackberry|bb10|opera mini/.test(ua);
      root.setAttribute('data-ua', isMobile ? 'mobile' : 'desktop');
    } catch {}
    var saved = localStorage.getItem('theme');
    if (saved) { root.setAttribute('data-theme', saved); return; }
    // Use system preference if available; otherwise default to LIGHT
    var dark = false; // default to light if undetectable
    if (window.matchMedia) {
      var m = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof m.matches === 'boolean') dark = !!m.matches;
    }
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
