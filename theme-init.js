(function(){
  try {
    var root = document.documentElement;
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
