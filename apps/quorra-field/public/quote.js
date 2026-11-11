(function () {
  var API = "https://vlwsrrbofnnatctezsmn.supabase.co/functions/v1";
  var q = new URLSearchParams(location.search), t = q.get("t");
  var api = API;
  var app = document.getElementById("app");
  var usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  var money = function (c) { return usd.format(c / 100); };
  var lineCents = function (qty, unit) {
    var q = Math.abs(Number(qty) || 0).toFixed(4).split(".");
    var digits = BigInt(q[0] + (q[1] + "0000").slice(0, 4));
    var prod = digits * BigInt(Math.trunc(Math.abs(Number(unit) || 0)));
    var n = Number((prod + 5000n) / 10000n);
    return (Number(qty) < 0) !== (Number(unit) < 0) ? -n : n;
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (iso) { return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); };
  function fail(m) { app.innerHTML = '<div class="card"><b>' + esc(m) + "</b></div>"; }
  if (!t) return fail("This quote link is not valid.");

  function post(body) {
    body.t = t;
    return fetch(api + "/quote-respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Something went wrong"); return j; }); });
  }

  var changing = false;
  var fmtT = function (iso) { return new Date(iso).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
  function render(d) {
    var b = d.business || {};
    var logo = /^https:\/\//i.test(String(b.logo || "")) || /^data:image\//i.test(String(b.logo || "")) ? esc(b.logo) : "";
    var h = '<div class="card"><header>' + (logo ? '<img src="' + logo + '" alt="">' : "") +
      '<div><h1>' + esc(b.name) + '</h1><div class="muted">' + esc([b.phone, b.email].filter(Boolean).join(" · ")) + "</div></div></header></div>";
    h += '<div class="card"><div class="muted">Quote #' + esc(d.number) + " for " + esc(d.customer) + " · valid until " + esc(fmt(d.valid_until)) + "</div><h1 style=\"margin-top:6px\">" + esc(d.title) + "</h1>";
    d.items.forEach(function (li) {
      h += '<div class="li"><div>' + esc(li.description || "Item") + '<div class="muted">' + esc(li.qty) + " × " + esc(money(li.unit_cents)) + "</div></div><b>" + esc(money(lineCents(li.qty, li.unit_cents))) + "</b></div>";
    });
    h += '<div class="tot muted"><span>Subtotal</span><span>' + esc(money(d.subtotal_cents)) + "</span></div>";
    h += '<div class="tot muted"><span>Tax (' + esc(d.tax_rate) + '%)</span><span>' + esc(money(d.total_cents - d.subtotal_cents)) + "</span></div>";
    h += '<div class="tot g"><span>Total</span><span>' + esc(money(d.total_cents)) + "</span></div>";
    if (d.notes) h += '<p class="muted" style="white-space:pre-wrap;margin-top:12px">' + esc(d.notes) + "</p>";
    h += "</div>";

    var picking = d.status === "approved" && (!d.scheduled_for || changing);
    if (d.status === "approved" && !picking) {
      var canChange = d.job_status === "scheduled" && d.slots;
      h += '<div class="card"><div class="msg ok">Quote accepted. You are scheduled for ' + esc(fmtT(d.scheduled_for)) + ".</div>" +
        '<button class="accept" id="ics">Add to my phone calendar</button><a id="gcal" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:10px;font-weight:700;color:var(--ink)">Add to Google Calendar</a>' +
        (d.job_status === "scheduled" ? '<button class="decline" id="chg">Reschedule</button>' : "") + "</div>";
    } else if (picking) {
      var days = {}, order = [];
      (d.slots || []).forEach(function (iso) { var k = new Date(iso).toDateString(); if (!days[k]) { days[k] = []; order.push(k); } days[k].push(iso); });
      h += '<div class="card actions"><b>' + (changing ? "Pick a new time" : "Quote accepted. Pick a time") + '</b><div class="muted">These are the times we have open. Pick one and we will text you a confirmation.</div>';
      if (!order.length) h += '<div class="msg">No online times are open right now. Please call ' + esc(b.phone || "us") + " to schedule.</div>";
      else {
        h += '<div class="cal" id="cal"></div><div class="muted" id="dlabel" style="margin-top:10px">Pick a day to see open times.</div>';
        h += '<div id="times" class="times"></div>';
        h += '<button class="accept" id="book" disabled>Confirm time</button>';
      }
      h += (changing ? '<button class="decline" id="keep">Keep my current time</button>' : "") + '<div id="out" role="status"></div></div>';
    } else if (d.status === "declined") {
      h += '<div class="card"><div class="msg">This quote was declined. If you change your mind, please contact us.</div></div>';
    } else if (d.status === "sent") {
      h += '<div class="card actions"><b>Accept this quote</b><div class="muted">Next you will choose a time that works for you.</div>' +
        '<button class="accept" id="acc">Accept quote</button>' +
        '<details><summary>Decline this quote</summary><label>Reason (optional)<select id="why"><option value="">Select a reason</option><option>Price too high</option><option>Went with someone else</option><option>Not ready yet</option><option>Other</option></select></label><label id="whyo" style="display:none">Tell us more<input id="whyt" type="text" maxlength="150" placeholder="Type your reason"></label><button class="decline" id="dec">Decline quote</button></details>' +
        '<div id="out" role="status"></div></div>';
    } else {
      h += '<div class="card"><div class="msg">This quote is not available to accept yet.</div></div>';
    }
    app.innerHTML = h;

    var out = function (cls, m) { var o = document.getElementById("out"); if (o) { o.className = "msg " + cls; o.textContent = m; } };
    var acc = document.getElementById("acc");
    if (acc) acc.onclick = function () {
      acc.disabled = true;
      post({ action: "accept", return_to: location.href.split("?")[0], api: api }).then(function () { return load(); }).catch(function (e) { acc.disabled = false; out("err", e.message); });
    };
    var icsBtn = document.getElementById("ics");
    if (icsBtn) {
      var st = new Date(d.scheduled_for), en = new Date(d.scheduled_end || (st.getTime() + 7200000));
      var z = function (x) { return x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
      var ttl = (d.title || "Service visit") + " - " + (b.name || "");
      var ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Quorra Dispatch//EN\r\nBEGIN:VEVENT\r\nUID:" + z(st) + "-" + (d.number || "q") + "@quorradispatch.com\r\nDTSTAMP:" + z(new Date()) + "\r\nDTSTART:" + z(st) + "\r\nDTEND:" + z(en) + "\r\nSUMMARY:" + ttl.replace(/[,;]/g, " ") + "\r\nDESCRIPTION:" + (b.phone ? "Questions? Call " + b.phone : "") + "\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
      icsBtn.onclick = function () {
        var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "visit.ics"; document.body.appendChild(a); a.click(); a.remove();
      };
      document.getElementById("gcal").href = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(ttl) + "&dates=" + z(st) + "/" + z(en) + "&details=" + encodeURIComponent(b.phone ? "Questions? Call " + b.phone : "");
    }
    var chg = document.getElementById("chg");
    if (chg) chg.onclick = function () { changing = true; load(); };
    var keep = document.getElementById("keep");
    if (keep) keep.onclick = function () { changing = false; load(); };
    var calEl = document.getElementById("cal");
    if (calEl) {
      var chosen = "", book = document.getElementById("book");
      var first = new Date(days[order[0]][0]); var cur = new Date(first.getFullYear(), first.getMonth(), 1);
      var lastD = new Date(days[order[order.length - 1]][0]); var lastM = new Date(lastD.getFullYear(), lastD.getMonth(), 1);
      var selKey = "";
      var showTimes = function (k) {
        selKey = k; chosen = ""; book.disabled = true;
        document.getElementById("dlabel").textContent = new Date(days[k][0]).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        document.getElementById("times").innerHTML = days[k].map(function (iso) {
          return '<button type="button" class="slot" data-iso="' + esc(iso) + '">' + esc(new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })) + "</button>";
        }).join("");
        Array.prototype.forEach.call(document.querySelectorAll(".slot"), function (el) {
          el.onclick = function () {
            chosen = el.getAttribute("data-iso"); book.disabled = false;
            Array.prototype.forEach.call(document.querySelectorAll(".slot"), function (x) { x.classList.toggle("on", x === el); });
          };
        });
        drawCal();
      };
      var drawCal = function () {
        var y = cur.getFullYear(), m = cur.getMonth();
        var h2 = '<div class="cal-h"><button type="button" id="pm"' + (cur <= new Date(first.getFullYear(), first.getMonth(), 1) ? " disabled" : "") + '>&lsaquo;</button><span>' + cur.toLocaleDateString("en-US", { month: "long", year: "numeric" }) + '</span><button type="button" id="nm"' + (cur >= lastM ? " disabled" : "") + '>&rsaquo;</button></div><div class="cal-g">';
        ["S", "M", "T", "W", "T", "F", "S"].forEach(function (w) { h2 += "<b>" + w + "</b>"; });
        for (var i = 0; i < new Date(y, m, 1).getDay(); i++) h2 += "<span></span>";
        for (var d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
          var k = new Date(y, m, d).toDateString(), has = !!days[k];
          h2 += '<button type="button" class="d' + (has ? " has" : "") + (k === new Date().toDateString() ? " today" : "") + (k === selKey ? " sel" : "") + '" data-k="' + esc(k) + '"' + (has ? "" : " disabled") + ">" + esc(d) + "</button>";
        }
        calEl.innerHTML = h2 + '</div><div class="cal-key"><span><i style="background:#ffedd5;border:1px solid #fdba74"></i>Open days</span><span><i style="box-shadow:inset 0 0 0 2px #0f1b2d"></i>Today, ' + new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) + "</span></div>";
        document.getElementById("pm").onclick = function () { cur = new Date(y, m - 1, 1); drawCal(); };
        document.getElementById("nm").onclick = function () { cur = new Date(y, m + 1, 1); drawCal(); };
        Array.prototype.forEach.call(calEl.querySelectorAll(".d.has"), function (el) { el.onclick = function () { showTimes(el.getAttribute("data-k")); }; });
      };
      drawCal();
      book.onclick = function () {
        if (!chosen) return;
        book.disabled = true; book.textContent = "Booking...";
        post({ action: "schedule", start: chosen, return_to: location.href.split("?")[0], api: api })
          .then(function () { changing = false; return load(); })
          .catch(function (e) { book.disabled = false; book.textContent = "Confirm time"; out("err", e.message); });
      };
    }
    var whySel = document.getElementById("why");
    if (whySel) whySel.onchange = function () { document.getElementById("whyo").style.display = whySel.value === "Other" ? "block" : "none"; };
    var dec = document.getElementById("dec");
    if (dec) dec.onclick = function () {
      dec.disabled = true;
      post({ action: "decline", reason: (function () { var v = document.getElementById("why").value; var o = document.getElementById("whyt").value.trim(); return v === "Other" && o ? "Other: " + o : v; })() })
        .then(function () { return load(); })
        .catch(function (e) { dec.disabled = false; out("err", e.message); });
    };
  }

  function load() {
    return fetch(api + "/quote-view?slots=1&t=" + encodeURIComponent(t))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || (r.status === 404 ? "The online quote is not switched on yet (the quote-view function is not deployed)." : r.status === 401 ? "The online quote needs to be redeployed with Verify JWT turned off." : (j.message || j.msg || "Could not load this quote (error " + r.status + ")"))); return j; }); })
      .then(render)
      .catch(function (e) { fail(e.message); });
  }
  load();
})();
