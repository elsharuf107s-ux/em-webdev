// Header & Stretcher concept: apply a saved light/dark choice before first paint.
// Without it (or without JS) the page follows the system setting.
try { var t = localStorage.getItem('hs-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* storage blocked */ }
document.documentElement.classList.add('js');
