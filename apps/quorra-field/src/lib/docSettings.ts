import type { DocSettings } from "./types";

export const DOC_DEFAULTS: Required<Pick<DocSettings, "accent" | "header" | "show_logo" | "show_address" | "show_phone" | "show_email" | "show_status" | "title_invoice" | "title_estimate" | "default_notes" | "default_estimate_notes" | "footer">> = {
  accent: "#0F2742",
  header: "band",
  show_logo: true,
  show_address: true,
  show_phone: true,
  show_email: true,
  show_status: true,
  title_invoice: "INVOICE",
  title_estimate: "ESTIMATE",
  default_notes: "",
  default_estimate_notes: "",
  footer: "",
};

export const docSettings = (s?: DocSettings | null) => ({ ...DOC_DEFAULTS, ...(s ?? {}) });

export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [15, 39, 66];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Black or white text, whichever reads on the given background. */
export const readableOn = (rgb: [number, number, number]): [number, number, number] =>
  (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? [20, 20, 20] : [255, 255, 255];
