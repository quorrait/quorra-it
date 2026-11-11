import type { LeadStage } from "./types";

const FORWARD: LeadStage[] = ["new", "contacted", "send_quote", "quote_sent", "work_order", "completed"];

/** Building a quote moves a lead forward to Send quote, or leaves a later stage alone. Never back to Contacted. */
export function stageAfterBuildQuote(current: LeadStage): LeadStage {
  const at = FORWARD.indexOf(current);
  const quoted = FORWARD.indexOf("send_quote");
  if (at === -1 || at >= quoted) return current;
  return "send_quote";
}
