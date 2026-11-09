// One look for every email we send. Five looks to choose from; customer emails use the business's saved look and colors.
// Keep this file identical to src/lib/emailHtml.ts.
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const LOGO = "https://www.quorrait.com/field/logo-mark-v2.png";

export interface Row { label: string; value: string }
export type EmailTheme = "classic" | "modern" | "minimal" | "bold" | "soft";
export interface EmailStyle { theme?: EmailTheme; header?: string; accent?: string }

const HEX = /^#[0-9a-fA-F]{6}$/;
const tint = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); const m = (v: number) => Math.round(255 - (255 - v) * a).toString(16).padStart(2, "0"); return `#${m(n >> 16)}${m((n >> 8) & 255)}${m(n & 255)}`; };

/** Builds the HTML for a branded email. `brand` is the business the email is on behalf of (shown in the header); defaults to Quorra Dispatch. */
export function emailHtml(o: { heading: string; paragraphs?: string[]; rows?: Row[]; button?: { label: string; url: string }; fine?: string; brand?: string; preheader?: string; style?: EmailStyle }): string {
  const brand = o.brand || "Quorra Dispatch";
  const theme: EmailTheme = o.style?.theme ?? "classic";
  const H = o.style?.header && HEX.test(o.style.header) ? o.style.header : "#0B2545";
  const A = o.style?.accent && HEX.test(o.style.accent) ? o.style.accent : "#EA580C";
  const own = !o.brand; // our own emails show our mark; a contractor's emails show only their name
  const mark = own ? `<td style="padding-right:10px"><img src="${LOGO}" width="30" height="30" alt="" style="display:block;border:0"></td>` : "";
  const p = (o.paragraphs ?? []).map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155">${esc(t).replace(/\n/g, "<br>")}</p>`).join("");
  const line = theme === "minimal" ? "#CBD5E1" : "#E2E8F0";
  const rows = o.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border-top:1px solid ${line}">${o.rows.map((r) => `<tr><td style="padding:11px 0;border-bottom:1px solid ${line};font-size:13px;color:#64748B;width:34%;vertical-align:top">${esc(r.label)}</td><td style="padding:11px 0;border-bottom:1px solid ${line};font-size:15px;color:#0F172A;font-weight:600;vertical-align:top">${esc(r.value).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`
    : "";
  const radius = theme === "soft" ? "999px" : theme === "minimal" ? "4px" : "10px";
  const btn = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td bgcolor="${A}" style="border-radius:${radius}"><a href="${esc(o.button.url)}" style="display:inline-block;padding:15px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:${radius}">${esc(o.button.label)}</a></td></tr></table>`
    : "";
  const fine = o.fine ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B">${esc(o.fine).replace(/\n/g, "<br>")}</p>` : "";
  const h1 = (color: string, size = 26, align = "left") => `<h1 style="margin:0 0 18px;font-size:${size}px;line-height:1.2;color:${color};text-align:${align}">${esc(o.heading)}</h1>`;
  const foot = `<tr><td align="center" style="padding:20px 10px;font-size:12px;color:#94A3B8">Sent with <a href="https://www.quorrait.com/dispatch/" style="color:#64748B;text-decoration:underline">Quorra Dispatch</a></td></tr>`;
  const pre = `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader ?? o.heading)}</span>`;
  const wrap = (bg: string, inner: string) => `<!doctype html><html><body style="margin:0;padding:0;background:${bg}">${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif">${inner}${foot}</table></td></tr></table></body></html>`;
  const brandCell = (color: string, size = 20) => `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${mark}<td style="font-size:${size}px;font-weight:700;color:${color};letter-spacing:.2px">${esc(brand)}</td></tr></table>`;

  if (theme === "modern") return wrap("#F1F5F9", `
<tr><td style="background:#ffffff;border-radius:14px 14px 0 0;border-top:6px solid ${A};padding:22px 28px;border-bottom:1px solid #E2E8F0">${brandCell(H)}</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:30px 28px">${h1(H)}${p}${rows}${btn}${fine}</td></tr>`);
  if (theme === "minimal") return wrap("#ffffff", `
<tr><td style="padding:8px 4px 18px;border-bottom:2px solid ${H}">${brandCell(H, 17)}</td></tr>
<tr><td style="padding:28px 4px 24px">${h1(H, 24)}${p}${rows}${btn}${fine}</td></tr>`);
  if (theme === "bold") return wrap("#E2E8F0", `
<tr><td style="background:${H};border-radius:16px 16px 0 0;padding:26px 28px 30px">${brandCell("#ffffff", 16)}<div style="height:18px;line-height:18px;font-size:0">&nbsp;</div><div style="font-size:30px;line-height:1.15;font-weight:800;color:#ffffff">${esc(o.heading)}</div></td></tr>
<tr><td style="height:6px;background:${A};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:30px 28px">${p}${rows}${btn}${fine}</td></tr>`);
  if (theme === "soft") return wrap(tint(H, 0.08), `
<tr><td align="center" style="padding:6px 0 20px">${brandCell(H, 20)}</td></tr>
<tr><td style="background:#ffffff;border-radius:24px;padding:34px 30px;border:1px solid ${tint(H, 0.18)}">${h1(H, 25, "center")}${p}${rows}<div style="text-align:center">${btn.replace('style="margin:8px 0 24px"', 'align="center" style="margin:8px auto 24px"')}</div>${fine}</td></tr>`);
  return wrap("#EEF2F7", `
<tr><td style="background:${H};border-radius:16px 16px 0 0;padding:22px 28px">${brandCell("#ffffff")}</td></tr>
<tr><td style="height:4px;background:${A};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:34px 28px 30px">${h1(H)}${p}${rows}${btn}${fine}</td></tr>`);
}
