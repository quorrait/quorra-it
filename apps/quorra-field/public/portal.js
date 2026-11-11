(function () {
  var API = "https://vlwsrrbofnnatctezsmn.supabase.co/functions/v1";
  var q = new URLSearchParams(location.search), t = q.get("t");
  var api = API;
  var demo = q.get("demo") === "1";
  var app = document.getElementById("app");
  var usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  var money = function (c) { return usd.format(c / 100); };
  // Same integer-cent multiply as the invoice. Float Math.round(qty * cents) is a cent or two low.
  var lineCents = function (qty, unit) {
    var q = Math.abs(Number(qty) || 0).toFixed(4).split(".");
    var digits = BigInt(q[0] + (q[1] + "0000").slice(0, 4));
    var prod = digits * BigInt(Math.trunc(Math.abs(Number(unit) || 0)));
    var n = Number((prod + 5000n) / 10000n);
    return (Number(qty) < 0) !== (Number(unit) < 0) ? -n : n;
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (iso) { return new Date(String(iso).length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  var day = function (n) { return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); };
  function fail(m) { app.innerHTML = '<div class="card"><b>' + esc(m) + "</b></div>"; }
  if (!demo && !t) return fail("This link is not valid.");
  var here = location.origin + location.pathname + "?" + (demo ? "demo=1" : "t=" + encodeURIComponent(t));
  var quoteBase = location.origin + location.pathname.replace(/portal\.html$/, "quote.html");

  var SAMPLE = {
    customer: "Dana Whitfield", can_pay: true,
    business: { name: "Summit Home Services", phone: "(916) 555-0142", email: "office@summithome.example" },
    invoices: [
      { id: "d1", number: 1042, status: "sent", issued_at: day(-20), due_at: day(-6), items: [{ description: "Replace kitchen faucet", qty: 1, unit_cents: 98000 }, { description: "Labor", qty: 6, unit_cents: 14333 }], total_cents: 183998, paid_cents: 50000, balance_cents: 133998, payments: [{ amount_cents: 50000, date: day(-18), method: "card" }] },
      { id: "d2", number: 1051, status: "sent", issued_at: day(-3), due_at: day(11), total_cents: 42500, paid_cents: 0, balance_cents: 42500, payments: [] },
      { id: "d3", number: 1018, status: "paid", issued_at: day(-70), due_at: day(-56), total_cents: 96000, paid_cents: 96000, balance_cents: 0, payments: [{ amount_cents: 96000, date: day(-60), method: "card" }] }
    ],
    quotes: [{ number: 311, title: "Water heater replacement", status: "sent", token: "demo", total_cents: 289000 }, { number: 288, title: "Drain cleaning", status: "approved", token: "demo", total_cents: 18500 }]
  };

  function render(d) {
    var b = d.business || {};
    var today = new Date().toISOString().slice(0, 10);
    var openInv = d.invoices.filter(function (i) { return i.status === "sent" && i.balance_cents > 0; });
    var totalDue = openInv.reduce(function (s, i) { return s + i.balance_cents; }, 0);
    var waiting = d.quotes.filter(function (x) { return x.status === "sent"; }).length;
    var logo = /^https:\/\//i.test(String(b.logo || "")) || /^data:image\//i.test(String(b.logo || "")) ? esc(b.logo) : "";
    var h = '<div class="card"><header>' + (logo ? '<img src="' + logo + '" alt="">' : "") +
      '<div><h1>' + esc(b.name) + '</h1><div class="muted">Customer portal</div></div></header>' +
      '<div class="contact">' + (b.phone ? '<a class="btn alt" href="tel:' + esc(b.phone) + '">Call</a>' : "") + (b.email ? '<a class="btn alt" href="mailto:' + esc(b.email) + '">Email</a>' : "") + "</div></div>";
    h += '<div class="due"><div class="muted">Hi ' + esc(d.customer) + "</div>" +
      (totalDue > 0 ? '<div class="big">' + esc(money(totalDue)) + '</div><div class="muted">due across ' + esc(openInv.length) + (openInv.length === 1 ? " invoice" : " invoices") + "</div>" : d.invoices.length ? '<div class="big">All paid up</div><div class="muted">You have nothing due right now.</div>' : waiting ? '<div class="big">Your quote</div>' : '<div class="big">Welcome</div><div class="muted">Nothing here yet.</div>') +
      (waiting ? '<div class="muted" style="margin-top:8px">' + waiting + (waiting === 1 ? " quote is" : " quotes are") + " waiting for your answer.</div>" : "") + "</div>";
    if (q.get("paid")) h += '<div class="msg ok">Thank you. Your payment is being processed and will show here shortly.</div>';
    h += '<div id="out"></div>';
    if (d.invoices.length) h += '<div class="card"><h2>Invoices</h2>';
    d.invoices.forEach(function (i) {
      var open = i.status === "sent" && i.balance_cents > 0;
      var late = open && i.due_at && String(i.due_at).slice(0, 10) < today;
      var badge = i.status === "paid" ? '<span class="badge paid">Paid</span>' : i.status === "void" ? '<span class="badge">Void</span>' : late ? '<span class="badge late">Overdue since ' + esc(fmt(i.due_at)) + "</span>" : '<span class="badge sent">Due ' + esc(fmt(i.due_at)) + "</span>";
      var pays = (i.payments || []).map(function (p) { return esc(money(p.amount_cents)) + " paid " + esc(fmt(p.date)) + (p.method && p.method !== "card" ? " (" + esc(p.method) + ")" : ""); }).join(" · ");
      h += '<div class="row"><div><b>Invoice #' + esc(i.number) + "</b> " + badge + '<div class="muted">Issued ' + esc(fmt(i.issued_at)) + "</div>" +
        (pays ? '<div class="pays">' + pays + "</div>" : "") + "</div>" +
        '<div class="right"><b>' + esc(money(open ? i.balance_cents : i.total_cents)) + "</b>" +
        (open && i.paid_cents > 0 ? '<div class="muted">of ' + esc(money(i.total_cents)) + "</div>" : "") +
        (open && d.can_pay ? '<div><button data-pay="' + esc(i.id) + '" style="margin-top:8px">Pay now</button></div>' : "") + "</div></div>" +
        (i.items && i.items.length ? '<div class="items">' + i.items.map(function (li) { return "<div><span>" + esc(li.description || "Item") + ' <span class="muted">' + (li.qty !== 1 ? esc(li.qty) + " x " + esc(money(li.unit_cents)) : "") + "</span></span><span>" + esc(money(lineCents(li.qty, li.unit_cents))) + "</span></div>"; }).join("") + "</div>" : "");
    });
    if (openInv.length && !d.can_pay) h += '<div class="msg info">To pay these, please contact ' + esc(b.name || "the business") + ".</div>";
    if (d.invoices.length) h += "</div>";
    if (d.quotes.length) h += '<div class="card"><h2>Quotes</h2>';
    d.quotes.forEach(function (x) {
      var link = demo ? "#" : quoteBase + "?t=" + encodeURIComponent(x.token);
      h += '<div class="row"><div><b>' + esc(x.title || "Quote #" + x.number) + '</b> <span class="badge ' + (x.status === "approved" || x.status === "sent" || x.status === "paid" ? x.status : "") + '">' + esc(x.status === "approved" ? "Accepted" : x.status === "sent" ? "Awaiting your answer" : x.status) + '</span><div class="muted">Quote #' + esc(x.number) + "</div></div>" +
        '<div class="right"><b>' + esc(money(x.total_cents)) + '</b><div><a class="btn alt' + (demo ? ' dq' : '') + '" style="margin-top:8px" href="' + esc(link) + '">' + (x.status === "sent" ? "Review" : "View") + "</a></div></div></div>";
    });
    if (d.quotes.length) h += "</div>";
    app.innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll(".dq"), function (a) {
      a.onclick = function (e) { e.preventDefault(); document.getElementById("out").innerHTML = '<div class="msg info">Preview only: on a live account this opens the quote so the customer can accept it.</div>'; };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-pay]"), function (btn) {
      btn.onclick = function () {
        if (demo) { document.getElementById("out").innerHTML = '<div class="msg info">Preview only: on a live account this opens a secure card payment page.</div>'; return; }
        btn.disabled = true; btn.textContent = "One moment...";
        fetch(api + "/portal-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: t, invoice_id: btn.getAttribute("data-pay"), return_to: here }) })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.url) throw new Error(j.error || "Could not start payment"); location.href = j.url; }); })
          .catch(function (e) { btn.disabled = false; btn.textContent = "Pay now"; document.getElementById("out").innerHTML = '<div class="msg err">' + esc(e.message) + "</div>"; });
      };
    });
  }
  if (demo) return render(SAMPLE);
  fetch(api + "/portal-view?t=" + encodeURIComponent(t))
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || (r.status === 404 ? "The customer portal is not switched on for this business yet (the portal-view function is not deployed)." : r.status === 401 ? "The customer portal needs to be redeployed with --no-verify-jwt." : (j.message || j.msg || "Could not load (error " + r.status + ")"))); return j; }); })
    .then(render).catch(function (e) { fail(e.message); });
})();
