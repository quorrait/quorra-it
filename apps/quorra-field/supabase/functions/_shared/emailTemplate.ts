// One look for every email we send: a navy header, a clean white card, a single orange button.
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const LOGO = "https://www.quorrait.com/field/logo-mark-v2.png";

export interface Row { label: string; value: string }

/** Builds the HTML for a branded email. `brand` is the business the email is on behalf of (shown in the header); defaults to Quorra Dispatch. */
export function emailHtml(o: { heading: string; paragraphs?: string[]; rows?: Row[]; button?: { label: string; url: string }; fine?: string; brand?: string; preheader?: string }): string {
  const brand = o.brand || "Quorra Dispatch";
  const p = (o.paragraphs ?? []).map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155">${esc(t).replace(/\n/g, "<br>")}</p>`).join("");
  const rows = o.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border-top:1px solid #E2E8F0">${o.rows.map((r) => `<tr><td style="padding:11px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#64748B;width:34%;vertical-align:top">${esc(r.label)}</td><td style="padding:11px 0;border-bottom:1px solid #E2E8F0;font-size:15px;color:#0F172A;font-weight:600;vertical-align:top">${esc(r.value).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`
    : "";
  const btn = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td bgcolor="#EA580C" style="border-radius:10px"><a href="${esc(o.button.url)}" style="display:inline-block;padding:15px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(o.button.label)}</a></td></tr></table>`
    : "";
  const fine = o.fine ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B">${esc(o.fine).replace(/\n/g, "<br>")}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#EEF2F7">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader ?? o.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#0B2545;border-radius:16px 16px 0 0;padding:22px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px"><img src="${LOGO}" width="30" height="30" alt="" style="display:block;border:0"></td><td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.2px">${esc(brand)}</td></tr></table>
</td></tr>
<tr><td style="height:4px;background:#EA580C;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:34px 28px 30px">
<h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;color:#0B2545">${esc(o.heading)}</h1>
${p}${rows}${btn}${fine}
</td></tr>
<tr><td align="center" style="padding:20px 10px;font-size:12px;color:#94A3B8">Sent with <a href="https://www.quorrait.com/dispatch/" style="color:#64748B;text-decoration:underline">Quorra Dispatch</a></td></tr>
</table></td></tr></table></body></html>`;
}
