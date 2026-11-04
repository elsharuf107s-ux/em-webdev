// E.M: small progressive enhancements. The site works without JS.
document.documentElement.classList.add('js'); // also set inline in <head> to avoid a flash

document.addEventListener('DOMContentLoaded', function () {
  // Mobile menu toggle
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // "Choose plan" buttons preselect the package in the contact form
  var select = document.getElementById('package');
  document.querySelectorAll('[data-plan]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (select) select.value = btn.getAttribute('data-plan');
    });
  });

  // Until a Formspree ID is set, send the form through the visitor's email app
  // instead of a broken endpoint. Values are URL-encoded, so nothing typed in
  // the form can add extra mail headers.
  var form = document.querySelector('.contact-form');
  if (form && form.action.indexOf('YOUR_FORM_ID') !== -1) {
    var status = form.querySelector('.form-status');
    var to = 'elsharuf107s@gmail.com';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lines = [];
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.type === 'hidden' || el.name.charAt(0) === '_' || el.type === 'submit') return;
        if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
        var value = el.value.trim();
        if (!value) return;
        var label = form.querySelector('label[for="' + el.id + '"]');
        lines.push((label ? label.textContent.trim() : el.name) + ': ' + value);
      });
      window.location.href = 'mailto:' + to + '?subject=' +
        encodeURIComponent('Website quote request') + '&body=' + encodeURIComponent(lines.join('\n'));
      if (status) {
        status.textContent = 'Thanks! Your email app should now open with your message ready to send. ' +
          'If nothing happens, email ' + to + ' directly.';
      }
    });
  }

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
