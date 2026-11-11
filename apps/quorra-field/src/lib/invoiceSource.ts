import type { Estimate } from "./types";

/**
 * Which estimate a new invoice may copy.
 * A job uses only the estimate tied to that job. With no job, only that customer's own open estimate.
 * Never another customer's quote, even if it has a higher number.
 */
export function invoiceEstimates(estimates: Estimate[], opts: { customerId?: string; jobId?: string; estimateId?: string }): Estimate[] {
  if (opts.estimateId) return estimates.filter((e) => e.id === opts.estimateId);
  const open = estimates.filter((e) => (e.status === "approved" || e.status === "sent") && !e.invoice_id);
  if (opts.jobId) {
    return open
      .filter((e) => e.job_id === opts.jobId && (!opts.customerId || e.customer_id === opts.customerId))
      .sort((a, b) => b.number - a.number);
  }
  if (!opts.customerId) return [];
  return open
    .filter((e) => e.customer_id === opts.customerId && !e.job_id)
    .sort((a, b) => b.number - a.number);
}
