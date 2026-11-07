/**
 * Ready-made invoice and estimate layouts. Each one is plain HTML that uses the same {{placeholders}} as an
 * uploaded layout, so they can be edited after choosing. {{accent}} follows the header color picked in
 * "Invoice and estimate layout", so every template can be recolored without touching the code.
 */
export interface DocTemplateChoice { id: string; name: string; desc: string; html: string }

const PRINT = "@page{margin:12mm} body{-webkit-print-color-adjust:exact;print-color-adjust:exact}";

const CLASSIC = `<!doctype html>
<html><head><meta charset="utf-8"><title>{{title}} {{number}}</title>
<style>
*{box-sizing:border-box}
body{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;margin:0;padding:40px;font-size:14px;line-height:1.45}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:2px solid {{accent}};padding-bottom:18px}
.biz{font-size:13px;color:#444}.biz h2{margin:6px 0 2px;font-size:21px;color:{{accent}}}
.doc{text-align:right}.doc h1{margin:0;font-size:30px;letter-spacing:.14em;font-weight:normal;color:{{accent}}}
.meta{display:flex;gap:44px;margin:24px 0 18px;flex-wrap:wrap}
.k{font:700 11px Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#777;margin-bottom:4px}
table{width:100%;border-collapse:collapse}
th{font:700 11px Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:8px 6px;border-bottom:1px solid {{accent}}}
th.r{text-align:right}td{padding:10px 6px;border-bottom:1px solid #ddd;vertical-align:top}
.totals{width:290px;margin:18px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:5px 0}
.totals .due{border-top:2px solid {{accent}};margin-top:6px;padding-top:9px;font-size:17px;font-weight:bold}
.notes{margin-top:28px;font-size:13px;color:#444}
.thanks{margin-top:34px;text-align:center;font-style:italic;color:#666}
${PRINT}
</style></head>
<body>
<div class="top">
  <div class="biz" style="{{biz_style}}">{{logo}}<h2>{{business_name}}</h2>{{business_address}}<br>{{business_phone}} &nbsp; {{business_email}}</div>
  <div class="doc"><h1>{{title}}</h1><div>No. {{number}}</div></div>
</div>
<div class="meta">
  <div><div class="k">Bill to</div><b>{{customer_name}}</b><br>{{customer_address}}<br>{{customer_phone}}</div>
  <div><div class="k">Issued</div>{{issued}}</div>
  <div><div class="k">{{date_label}}</div>{{date_value}}</div>
  <div><div class="k">Status</div><b>{{status}}</b></div>
</div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>{{items}}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><span>{{subtotal}}</span></div>
  <div><span>Tax</span><span>{{tax}}</span></div>
  <div><span>Paid</span><span>{{paid}}</span></div>
  <div class="due"><span>Balance due</span><span>{{balance}}</span></div>
</div>
<div class="notes">{{notes}}</div>
<div class="thanks">Thank you for your business.</div>
</body></html>
`;

const MODERN = `<!doctype html>
<html><head><meta charset="utf-8"><title>{{title}} {{number}}</title>
<style>
*{box-sizing:border-box}
body{font-family:"Segoe UI",Helvetica,Arial,sans-serif;color:#1f2937;margin:0;font-size:14px;line-height:1.45}
.band{background:{{accent}};color:#fff;padding:30px 40px;display:flex;justify-content:space-between;align-items:center;gap:20px}
.band h2{margin:0;font-size:22px}.band .sub{opacity:.85;font-size:13px;margin-top:2px}
.band h1{margin:0;font-size:32px;letter-spacing:.1em;text-align:right}.band .no{text-align:right;opacity:.9}
.wrap{padding:28px 40px 36px}
.cols{display:flex;justify-content:space-between;gap:30px;flex-wrap:wrap;margin-bottom:24px}
.k{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#6b7280;font-weight:700;margin-bottom:4px}
table{width:100%;border-collapse:collapse}
th{background:#f3f4f6;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#4b5563;padding:10px 12px}
th.r{text-align:right}td{padding:12px;border-bottom:1px solid #eceff3;vertical-align:top}
tbody tr:nth-child(even) td{background:#fafbfc}
.totals{width:300px;margin:22px 0 0 auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:14px 18px}
.totals div{display:flex;justify-content:space-between;padding:4px 0}
.totals .due{border-top:1px solid #d1d5db;margin-top:8px;padding-top:10px;font-size:18px;font-weight:700;color:{{accent}}}
.pill{display:inline-block;padding:3px 12px;border-radius:99px;background:#eef2ff;font-weight:700;font-size:12px}
.notes{margin-top:26px;color:#4b5563;font-size:13px}
.foot{margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center}
${PRINT}
</style></head>
<body>
<div class="band">
  <div style="{{biz_style}}">{{logo}}<h2>{{business_name}}</h2><div class="sub">{{business_phone}} &nbsp; {{business_email}}</div></div>
  <div><h1>{{title}}</h1><div class="no">No. {{number}}</div></div>
</div>
<div class="wrap">
  <div class="cols">
    <div><div class="k">Billed to</div><b>{{customer_name}}</b><br>{{customer_address}}<br>{{customer_email}}</div>
    <div><div class="k">Issued</div>{{issued}}<div class="k" style="margin-top:10px">{{date_label}}</div>{{date_value}}</div>
    <div><div class="k">Status</div><span class="pill">{{status}}</span></div>
  </div>
  <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>{{items}}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div><span>Tax</span><span>{{tax}}</span></div>
    <div><span>Paid</span><span>{{paid}}</span></div>
    <div class="due"><span>Balance due</span><span>{{balance}}</span></div>
  </div>
  <div class="notes">{{notes}}</div>
  <div class="foot">{{business_name}} &nbsp; {{business_address}}</div>
</div>
</body></html>
`;

const BOLD = `<!doctype html>
<html><head><meta charset="utf-8"><title>{{title}} {{number}}</title>
<style>
*{box-sizing:border-box}
body{font-family:"Arial Black",Arial,Helvetica,sans-serif;color:#111;margin:0;padding:0;font-size:14px;line-height:1.45}
.pad{padding:36px 40px 0}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
.top h1{margin:0;font-size:58px;line-height:.95;letter-spacing:-.02em;color:{{accent}};font-weight:900}
.top .no{font-family:Arial,sans-serif;font-weight:700;color:#444;margin-top:8px}
.due{background:{{accent}};color:#fff;padding:16px 22px;border-radius:6px;text-align:right;min-width:200px}
.due .l{font:700 11px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#bbb}
.due .v{font-size:30px;margin-top:2px}
.sec{font-family:Arial,sans-serif;display:flex;gap:30px;flex-wrap:wrap;margin:30px 0 24px}
.sec>div{border-left:5px solid {{accent}};padding-left:12px;min-width:160px}
.k{font:700 11px Arial,sans-serif;text-transform:uppercase;letter-spacing:.12em;color:#777;margin-bottom:3px}
table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif}
th{background:{{accent}};color:#fff;text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:11px 12px}
th.r{text-align:right}td{padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top}
.totals{font-family:Arial,sans-serif;width:300px;margin:20px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:5px 12px}
.totals .grand{background:{{accent}};color:#fff;font-weight:700;font-size:17px;padding:11px 12px;margin-top:8px;border-radius:4px}
.notes{font-family:Arial,sans-serif;margin:26px 0 0;color:#444;font-size:13px}
.bar{background:{{accent}};color:#ddd;font:12px Arial,sans-serif;padding:16px 40px;margin-top:36px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
${PRINT}
</style></head>
<body>
<div class="pad">
  <div style="margin-bottom:14px;{{biz_style}}">{{logo}}<b style="font-family:Arial,sans-serif">{{business_name}}</b></div>
  <div class="top">
    <div><h1>{{title}}</h1><div class="no">No. {{number}} &middot; {{status}}</div></div>
    <div class="due"><div class="l">Balance due</div><div class="v">{{balance}}</div></div>
  </div>
  <div class="sec">
    <div><div class="k">Bill to</div><b>{{customer_name}}</b><br>{{customer_address}}</div>
    <div><div class="k">Issued</div>{{issued}}</div>
    <div><div class="k">{{date_label}}</div>{{date_value}}</div>
  </div>
  <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>{{items}}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div><span>Tax</span><span>{{tax}}</span></div>
    <div><span>Paid</span><span>{{paid}}</span></div>
    <div class="grand"><span>Total due</span><span>{{balance}}</span></div>
  </div>
  <div class="notes">{{notes}}</div>
</div>
<div class="bar"><span><b>{{business_name}}</b></span><span>{{business_phone}}</span><span>{{business_email}}</span><span>{{business_address}}</span></div>
</body></html>
`;

const TRADE = `<!doctype html>
<html><head><meta charset="utf-8"><title>{{title}} {{number}}</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:32px;font-size:13.5px;line-height:1.4}
.box{border:1.5px solid {{accent}}}
.head{display:flex;border:1.5px solid {{accent}}}
.head>div{padding:14px 16px}
.head .biz{flex:1;border-right:1.5px solid {{accent}}}.head .biz h2{margin:6px 0 2px;font-size:20px}
.head .doc{min-width:190px;text-align:center;background:{{accent}};color:#fff}
.head .doc h1{margin:0;font-size:24px;letter-spacing:.1em}.head .doc .no{font-size:18px;margin-top:6px;font-weight:700}
.two{display:flex;border:1.5px solid {{accent}};border-top:0}
.two>div{flex:1;padding:12px 16px}.two>div+div{border-left:1.5px solid {{accent}}}
.k{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#666;margin-bottom:3px}
table{width:100%;border-collapse:collapse;margin-top:14px;border:1.5px solid {{accent}}}
th{background:color-mix(in srgb,{{accent}} 14%,#fff);text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:9px 10px;border:1px solid {{accent}}}
th.r{text-align:right}td{padding:9px 10px;border:1px solid #999;vertical-align:top}
.lower{display:flex;gap:16px;margin-top:14px;align-items:flex-start}
.lower .n{flex:1;border:1.5px solid {{accent}};padding:10px 12px;min-height:110px}
.totals{width:270px;border:1.5px solid {{accent}}}.totals div{display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #bbb}
.totals .due{border-bottom:0;background:{{accent}};color:#fff;font-weight:700;font-size:16px}
.sign{display:flex;gap:30px;margin-top:38px}.sign div{flex:1;border-top:1.5px solid {{accent}};padding-top:5px;font-size:11px;color:#555}
.thanks{text-align:center;margin-top:20px;font-weight:700}
${PRINT}
</style></head>
<body>
<div class="head">
  <div class="biz" style="{{biz_style}}">{{logo}}<h2>{{business_name}}</h2>{{business_address}}<br>{{business_phone}} &nbsp; {{business_email}}</div>
  <div class="doc"><h1>{{title}}</h1><div class="no">No. {{number}}</div></div>
</div>
<div class="two">
  <div><div class="k">Bill to</div><b>{{customer_name}}</b><br>{{customer_address}}<br>{{customer_phone}}</div>
  <div><div class="k">Date issued</div>{{issued}}<div class="k" style="margin-top:8px">{{date_label}}</div>{{date_value}}</div>
  <div><div class="k">Payment status</div><b>{{status}}</b></div>
</div>
<table><thead><tr><th>Work performed / materials</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>{{items}}</tbody></table>
<div class="lower">
  <div class="n"><div class="k">Notes and terms</div>{{notes}}</div>
  <div class="totals">
    <div><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div><span>Tax</span><span>{{tax}}</span></div>
    <div><span>Paid</span><span>{{paid}}</span></div>
    <div class="due"><span>Balance due</span><span>{{balance}}</span></div>
  </div>
</div>
<div class="sign"><div>Customer signature</div><div>Date</div></div>
<div class="thanks">Thank you for choosing {{business_name}}!</div>
</body></html>
`;

const DISPATCH = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}} {{number}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Sora:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--acc:{{accent}};--ink:#14232B;--dark:{{accent}};--mute:#6B5F58;--line:#E4D6CC;--tint:color-mix(in srgb,{{accent}} 13%,#fff)}
*{box-sizing:border-box}
body{margin:0;background:#e9e4e0;font-family:'IBM Plex Sans',system-ui,-apple-system,"Segoe UI",Arial,sans-serif;font-size:14px;line-height:1.5;color:var(--ink)}
.page{width:816px;min-height:1056px;margin:0 auto;background:#fff;display:flex;flex-direction:column}
.top{height:12px;background:var(--acc)}
.head{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:40px 56px 0}
.brand{display:flex;align-items:center;gap:14px}
.brand img{max-height:56px;max-width:120px;object-fit:contain}
.brand .n{font-family:Sora,"Segoe UI",Arial,sans-serif;font-weight:700;font-size:26px;line-height:1.1;color:var(--dark)}
.inv{text-align:right}
.inv .t{font-family:Sora,"Segoe UI",Arial,sans-serif;font-weight:700;font-size:40px;line-height:1;color:var(--dark);text-transform:capitalize}
.inv .no{font-size:15px;font-weight:500;color:var(--acc);margin-top:8px}
.wave{height:3px;margin:26px 0 4px;border-radius:3px;background:linear-gradient(90deg,{{accent}},color-mix(in srgb,{{accent}} 15%,#fff))}
.three{display:grid;grid-template-columns:1fr .9fr 1.3fr;gap:28px;padding:14px 56px 0;align-items:stretch}
.lbl{font-size:13px;font-weight:600;color:var(--mute);margin-bottom:8px}
.cust{font-size:17px;font-weight:600;color:var(--dark)}
.row{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}.row span:first-child{color:var(--mute)}
.due{background:var(--dark);color:#fff;border-radius:10px;padding:22px 20px;display:flex;flex-direction:column;justify-content:center}
.due .a{font-size:13px;color:rgba(255,255,255,.72)}
.due .m{font-family:Sora,"Segoe UI",Arial,sans-serif;font-weight:700;font-size:30px;line-height:1.15;margin-top:4px}
.items{margin:40px 56px 0}
table{width:100%;border-collapse:separate;border-spacing:0}
th{background:var(--tint);padding:11px 16px;font-size:13px;font-weight:600;color:var(--dark);text-align:left}
th:first-child{border-radius:6px 0 0 6px}th:last-child{border-radius:0 6px 6px 0}th.r{text-align:right}
td{padding:14px 16px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--dark)}
.tot{margin:20px 56px 0 auto;width:312px;padding-right:16px}
.tot .l{display:flex;justify-content:space-between;padding:4px 0;color:var(--mute)}
.tot .final{display:flex;justify-content:space-between;align-items:baseline;padding-top:12px;margin-top:6px;border-top:2px solid var(--dark)}
.tot .final span:first-child{font-weight:600;color:var(--dark)}
.tot .final span:last-child{font-family:Sora,"Segoe UI",Arial,sans-serif;font-weight:700;font-size:22px;color:var(--dark)}
.sp{flex:1;min-height:40px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:0 56px 28px}
.foot{display:flex;justify-content:space-between;gap:12px;margin:0 56px;padding:16px 0 34px;border-top:1px solid var(--line);font-size:13px;color:var(--mute)}
.foot b{font-weight:500;color:var(--dark)}
@page{size:letter;margin:0}
@media print{body{background:#fff}.page{width:100%;min-height:100vh}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
@media(max-width:840px){.page{width:100%}.head,.three,.two{padding-left:20px;padding-right:20px}.items,.foot{margin-left:20px;margin-right:20px}.three,.two{grid-template-columns:1fr}.tot{margin-right:20px}.inv .t{font-size:30px}}
</style></head>
<body>
<div class="page">
<div class="top"></div>
<div class="head">
  <div class="brand" style="{{biz_style}}">{{logo}}<div class="n">{{business_name}}</div></div>
  <div class="inv"><div class="t">{{title}}</div><div class="no">No. {{number}}</div></div>
</div>
<div class="wave"></div>
<div class="three">
  <div><div class="lbl">Billed to</div>
    <div class="cust">{{customer_name}}</div>
    <div style="margin-top:4px">{{customer_address}}<br>{{customer_phone}}<br>{{customer_email}}</div></div>
  <div><div class="lbl">Details</div>
    <div class="row"><span>Issued</span><span>{{issued}}</span></div>
    <div class="row"><span>{{date_label}}</span><span>{{date_value}}</span></div>
    <div class="row"><span>Status</span><span style="font-weight:500">{{status}}</span></div></div>
  <div class="due"><div class="a">Amount due</div><div class="m">{{balance}}</div><div class="a" style="margin-top:6px">{{date_label}} {{date_value}}</div></div>
</div>
<div class="items">
  <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>{{items}}</tbody></table>
</div>
<div class="tot">
  <div class="l"><span>Subtotal</span><span>{{subtotal}}</span></div>
  <div class="l"><span>Tax</span><span>{{tax}}</span></div>
  <div class="l"><span>Paid</span><span>{{paid}}</span></div>
  <div class="final"><span>Total due</span><span>{{balance}}</span></div>
</div>
<div class="sp"></div>
<div class="two">
  <div><div class="lbl">How to pay</div><div>Please include invoice number {{number}} with your payment.</div><div style="margin-top:4px">{{business_phone}} &nbsp; {{business_email}}</div></div>
  <div><div class="lbl">Notes</div><div>{{notes}}</div></div>
</div>
<div class="foot"><div>{{business_name}} &nbsp; {{business_address}}</div><b>Thank you for your business.</b></div>
</div>
</body></html>
`;

const withFooter = (h: string) => h.replace(/<\/body>/i, '<div style="text-align:center;font:11px/1.4 system-ui,Arial,sans-serif;color:#777;margin-top:10px">{{footer}}</div>\n</body>');

export const INVOICE_TEMPLATES: DocTemplateChoice[] = ([
  { id: "classic", name: "Classic", desc: "Traditional black and white with a clean rule", html: CLASSIC },
  { id: "dispatch", name: "Accent Panel", desc: "Clean header and a bold amount-due panel", html: DISPATCH },
  { id: "modern", name: "Modern band", desc: "Color header band, shaded totals box", html: MODERN },
  { id: "bold", name: "Bold", desc: "Big title and a balance-due highlight", html: BOLD },
  { id: "trade", name: "Job ticket", desc: "Boxed layout with a signature line", html: TRADE },
] as DocTemplateChoice[]).map((t) => ({ ...t, html: withFooter(t.html) }));
