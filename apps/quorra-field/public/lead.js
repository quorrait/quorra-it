(function () {
  var API = "https://vlwsrrbofnnatctezsmn.supabase.co/functions/v1";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsd3NycmJvZm5uYXRjdGV6c21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5OTkxOTMsImV4cCI6MjEwOTU3NTE5M30.GQT3UL5YxQEMzG3JoldgWZWLBqWqHamOT6yxTPMtdTA";
  var q = new URLSearchParams(location.search);
  var key = q.get("k"), api = API, demo = q.get("demo") === "1", name = q.get("n"), anon = ANON;
  var f = document.getElementById("f"), out = document.getElementById("out"), go = document.getElementById("go");
  var cfg = {}, bizName = name || "";
  if (name) document.getElementById("biz").textContent = name;
  function escHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function show(cls, text) { out.className = "msg " + cls; out.textContent = text; }
  function shade(hex, amt) { var n = parseInt(hex.slice(1), 16), r = Math.max(0, (n >> 16) - amt), g = Math.max(0, ((n >> 8) & 255) - amt), b = Math.max(0, (n & 255) - amt); return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
  // Business-supplied HTML runs in a sealed frame (scripts allowed, but no access to this page or the account).
  // A small bridge catches its form, and this page sends the request, so the intake rules stay the same.
  var BRIDGE = '<scr' + 'ipt>(function(){var known={name:1,phone:1,email:1,address:1,service:1,message:1,hp:1};function status(t,ok){var s=document.getElementById("quorra-status");if(!s){s=document.createElement("div");s.id="quorra-status";s.style.cssText="margin:12px 0;padding:10px 12px;border-radius:8px;font:600 14px system-ui,sans-serif";document.body.appendChild(s)}s.textContent=t;s.style.background=ok?"#ecfdf3":"#fef3f2";s.style.color=ok?"#137a3c":"#b42318"}document.addEventListener("submit",function(e){e.preventDefault();var f=e.target,fd=new FormData(f),d={},extra=[];fd.forEach(function(v,k){if(typeof v!=="string")return;if(known[k])d[k]=v;else if(v.trim())extra.push(k+": "+v)});if(extra.length)d.message=((d.message||"")+"\\n"+extra.join("\\n")).trim();parent.postMessage({quorraLead:d},"*");status("Sending...",true)},true);window.addEventListener("message",function(e){var m=e.data&&e.data.quorraResult;if(!m)return;status(m.text,m.ok);if(m.ok){document.querySelectorAll("form").forEach(function(f){f.reset()})}});function size(){parent.postMessage({quorraHeight:document.documentElement.scrollHeight},"*")}window.addEventListener("load",size);if(window.ResizeObserver)new ResizeObserver(size).observe(document.documentElement)})();</scr' + 'ipt>';
  var frame = document.getElementById("custom");
  function applyFieldOptions(html) {
    var hideEmail = cfg.show_email === false, hideAddr = cfg.show_address === false, hideSvc = cfg.show_service === false, reqPhone = !!cfg.require_phone, extra = String(cfg.extra_label || "").trim();
    if (!hideEmail && !hideAddr && !hideSvc && !reqPhone && !extra) return html;
    var doc = new DOMParser().parseFromString(html, "text/html");
    function drop(n) { Array.prototype.forEach.call(doc.querySelectorAll('[name="' + n + '"]'), function (el) { (el.closest("label") || el).remove(); }); }
    if (hideEmail) drop("email");
    if (hideAddr) drop("address");
    if (hideSvc) drop("service");
    var ph = doc.querySelector('input[name="phone"]');
    if (reqPhone && ph) ph.required = true;
    if (extra && ph) {
      var lab = ph.closest("label"), node = (lab || ph).cloneNode(true), inp = node.matches("input") ? node : node.querySelector("input");
      inp.name = extra; inp.type = "text"; inp.required = false; inp.removeAttribute("autocomplete"); inp.placeholder = lab ? "" : extra;
      if (lab) { Array.prototype.forEach.call(node.childNodes, function (c) { if (c.nodeType === 3) c.textContent = ""; }); node.insertBefore(doc.createTextNode(extra), node.firstChild); }
      var btn = doc.querySelector('button[type="submit"],button:not([type])');
      if (btn) btn.parentNode.insertBefore(node, btn);
    }
    return "<!doctype html>" + doc.documentElement.outerHTML;
  }
  function useCustom(html) {
    // Placeholders: {{accent}} {{business_name}} {{service_options}} and {{heading|Fallback}} {{intro|Fallback}} {{button|Fallback}}.
    var acc = cfg.accent && /^#[0-9a-f]{6}$/i.test(cfg.accent) ? cfg.accent : "#ea580c";
    var svc = (cfg.services || []).filter(function (x) { return String(x).trim(); });
    var opts = svc.length ? '<option value="">Choose one</option>' + svc.map(function (x) { return "<option>" + escHtml(String(x).trim()) + "</option>"; }).join("")
      : '<option value="">Choose one</option><option>Repair</option><option>Installation or replacement</option><option>Maintenance or tune-up</option><option>Inspection or estimate</option><option>Something else</option>';
    html = html.replace(/\{\{\s*accent\s*\}\}/gi, acc)
      .replace(/\{\{\s*business_name\s*\}\}/gi, escHtml(bizName || "Our team"))
      .replace(/\{\{\s*service_options\s*\}\}/gi, opts)
      .replace(/\{\{\s*(heading|intro|button)\s*(?:\|([^}]*))?\}\}/gi, function (m, k, fb) { var v = String(cfg[k.toLowerCase()] || "").trim(); return v ? escHtml(v) : String(fb || "").trim(); });
    html = applyFieldOptions(html);
    document.getElementById("builtin").style.display = "none";
    frame.style.display = "block";
    frame.srcdoc = html + BRIDGE;
  }
  window.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow) return;
    var m = e.data || {};
    if (typeof m.quorraHeight === "number") { frame.style.height = Math.min(Math.max(m.quorraHeight, 200), 3000) + "px"; return; }
    if (!m.quorraLead || typeof m.quorraLead !== "object") return;
    var d = {}; ["name", "phone", "email", "address", "service", "message", "hp"].forEach(function (k) { if (typeof m.quorraLead[k] === "string") d[k] = m.quorraLead[k]; });
    function reply(ok, text) { frame.contentWindow.postMessage({ quorraResult: { ok: ok, text: text } }, "*"); }
    if (!(d.name || "").trim()) return reply(false, "Please enter your name.");
    if (!(d.phone || "").trim() && !(d.email || "").trim()) return reply(false, "Please enter a phone number or email so we can reach you.");
    if (demo) return reply(true, "Preview only: on your live form this request would now appear under Leads.");
    d.k = key;
    fetch(api.replace(/\/$/, "") + "/lead-intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) { reply(r.ok, r.ok ? (cfg.thanks || "Thank you. Your request was sent and we will contact you shortly.") : (r.j.error || "Something went wrong. Please try again.")); })
      .catch(function () { reply(false, "Could not send your request. Please check your connection and try again."); });
  });
  function apply(c) {
    cfg = c || {};
    if (typeof cfg.custom_html === "string" && cfg.custom_html.trim()) { useCustom(cfg.custom_html); return; }
    if (cfg.heading) { document.getElementById("h").textContent = cfg.heading; document.title = cfg.heading; }
    if (cfg.intro) document.getElementById("intro").textContent = cfg.intro;
    if (cfg.button) go.textContent = cfg.button;
    if (cfg.accent && /^#[0-9a-f]{6}$/i.test(cfg.accent)) { document.documentElement.style.setProperty("--brand", cfg.accent); document.documentElement.style.setProperty("--brand-dark", shade(cfg.accent, 24)); }
    if (cfg.show_address === false) document.getElementById("laddr").style.display = "none";
    if (cfg.show_service === false) document.getElementById("lservice").style.display = "none";
    if (cfg.show_email === false) document.getElementById("lemail").style.display = "none";
    if (cfg.require_phone) { document.getElementById("phone").required = true; document.getElementById("hint").textContent = "Please include a phone number so we can reach you."; }
    if (cfg.extra_label) { document.getElementById("lextra").style.display = ""; document.getElementById("extraLabel").textContent = cfg.extra_label; }
    if (cfg.services && cfg.services.length) {
      var sel = document.createElement("select"); sel.name = "service";
      sel.style.cssText = "font:inherit;font-weight:400;padding:12px 13px;border:1px solid var(--line);border-radius:10px;background:var(--soft);color:var(--ink);width:100%";
      var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Choose a service"; sel.appendChild(o0);
      cfg.services.forEach(function (x) { var o = document.createElement("option"); o.value = x; o.textContent = x; sel.appendChild(o); });
      var lab = document.getElementById("lservice"); lab.removeChild(lab.querySelector("input")); lab.appendChild(sel);
    }
  }
  // Wording comes from the preview link, or from the business's saved settings.
  if (q.get("cfg")) { try { apply(JSON.parse(decodeURIComponent(escape(atob(q.get("cfg")))))); } catch (e) {} }
  else if (!demo && key && api && anon) {
    fetch(api.replace(/\/functions\/v1\/?$/, "") + "/rest/v1/rpc/lead_form_config", { method: "POST", headers: { "Content-Type": "application/json", apikey: anon, Authorization: "Bearer " + anon }, body: JSON.stringify({ p_key: key }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) { if (j.name && !name) { document.getElementById("biz").textContent = j.name; bizName = j.name; } apply(j.form); } })
      .catch(function () {});
  }
  if (!demo && !key) show("err", "This form is not set up correctly.");
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = Object.fromEntries(new FormData(f).entries());
    if (!d.name.trim()) return show("err", "Please enter your name.");
    if (cfg.require_phone && !(d.phone || "").trim()) return show("err", "Please enter a phone number.");
    if (!(d.phone || "").trim() && !(d.email || "").trim()) return show("err", "Please enter a phone number or email so we can reach you.");
    if (d.extra && cfg.extra_label) d.message = ((d.message || "") + "\n" + cfg.extra_label + ": " + d.extra).trim();
    delete d.extra;
    var thanks = cfg.thanks || "Thank you. Your request was sent and we will contact you shortly.";
    if (demo) { f.reset(); return show("ok", "Preview only: on your live form this request would now appear under Leads."); }
    d.k = key; go.disabled = true; show("", "");
    fetch(api.replace(/\/$/, "") + "/lead-intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) { go.disabled = false; return show("err", r.j.error || "Something went wrong. Please try again."); }
        f.reset(); go.textContent = "Request sent";
        show("ok", thanks);
      })
      .catch(function () { go.disabled = false; show("err", "Could not send your request. Please check your connection and try again."); });
  });
})();
