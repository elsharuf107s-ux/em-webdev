// Open/closed status from the posted hours (Cleveland time).
// Hours: Sun 12-9pm, Mon-Thu 12-10pm, Fri-Sat 11:30am-12am. [open, close] in minutes after midnight.
(function () {
  var H = [[720, 1260], [720, 1320], [720, 1320], [720, 1320], [720, 1320], [690, 1440], [690, 1440]];
  var fmt = function (m) {
    if (m >= 1440) return "midnight";
    var h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return h + (mm ? ":" + String(mm).padStart(2, "0") : "") + ap;
  };
  // Closed since the March 2026 fire: don't claim "Open now".
  var d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
  document.querySelectorAll("[data-status]").forEach(function (el) {
    el.innerHTML = "<b>Closed</b> · since March 2026 fire";
    el.classList.add("closed");
  });
  var rows = document.querySelectorAll(".hours li[data-days]");
  rows.forEach(function (li) { if (li.dataset.days.split(",").indexOf(String(d)) > -1) li.classList.add("today"); });
})();

// "Message us" buttons jump to the message form and put the cursor in it.
document.querySelectorAll('a[href$="#message"]').forEach(function (a) {
  a.addEventListener("click", function () {
    var f = document.querySelector("#message input");
    if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 450);
  });
});

// Forms email the restaurant through Web3Forms (free, no server).
// SETUP: paste the access key from web3forms.com here. Empty = preview mode (nothing is sent).
var FORM_KEY = "";

document.querySelectorAll("form").forEach(function (f) {
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = f.querySelector("button"), p = f.querySelector(".sent") || document.createElement("p");
    p.className = "sent";
    p.setAttribute("role", "status");
    f.appendChild(p);
    var done = function (ok) {
      p.textContent = "Preview only: nothing was sent. Whitmore's has been closed since a fire in March 2026.";
      if (ok) f.reset();
      btn.disabled = false;
    };
    if (!FORM_KEY) return done(true);
    btn.disabled = true;
    p.textContent = "Sending...";
    var data = Object.fromEntries(new FormData(f));
    data.access_key = FORM_KEY;
    data.subject = f.dataset.subject || "Website message";
    data.from_name = "Whitmore's website";
    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json(); })
      .then(function (j) { done(j.success); })
      .catch(function () { done(false); });
  });
});
