import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceTotals, lineTotal, taxCents } from "../src/lib/money.ts";
import { invoiceEstimates } from "../src/lib/invoiceSource.ts";
import { stageAfterBuildQuote } from "../src/lib/leadStage.ts";
import type { Estimate } from "../src/lib/types.ts";

const est = (p: Partial<Estimate> & Pick<Estimate, "id" | "number" | "customer_id">): Estimate => ({
  title: "Quote", status: "sent", items: [], tax_rate: 0, issued_at: "", valid_until: "", notes: "",
  job_id: null, invoice_id: null, ...p,
});

test("line totals use integer cents, so a half cent is not lost", () => {
  assert.equal(lineTotal({ qty: 4.02, unit_cents: 125 }), 503);
  assert.equal(Math.round(4.02 * 125), 502);
  const items = [{ description: "a", qty: 4.02, unit_cents: 125 }, { description: "b", qty: 4.02, unit_cents: 125 }];
  assert.equal(invoiceTotals({ items, tax_rate: 0 }).total, 1006);
  assert.equal(taxCents(1299, 7.75), 101);
});

test("a new invoice does not copy estimate #2007 from another customer or another job", () => {
  const rows = [
    est({ id: "a", number: 2001, customer_id: "c1", job_id: "job-1" }),
    est({ id: "b", number: 2007, customer_id: "c2" }),
    est({ id: "c", number: 2004, customer_id: "c1" }),
  ];
  assert.equal(invoiceEstimates(rows, { customerId: "c1", jobId: "job-1" })[0]?.number, 2001);
  assert.equal(invoiceEstimates(rows, { customerId: "c1", jobId: "job-2" }).length, 0);
  assert.equal(invoiceEstimates(rows, { customerId: "c1" })[0]?.number, 2004);
  assert.equal(invoiceEstimates(rows, { customerId: "c2" })[0]?.number, 2007);
  assert.equal(invoiceEstimates(rows, {}).length, 0);
  assert.equal(invoiceEstimates(rows, { estimateId: "b", customerId: "c1" }).length, 0);
  assert.equal(invoiceEstimates(rows, { estimateId: "b", customerId: "c2" })[0]?.number, 2007);
});

test("building a quote never moves a lead back to Contacted", () => {
  assert.equal(stageAfterBuildQuote("new"), "send_quote");
  assert.equal(stageAfterBuildQuote("contacted"), "send_quote");
  assert.equal(stageAfterBuildQuote("send_quote"), "send_quote");
  assert.equal(stageAfterBuildQuote("quote_sent"), "quote_sent");
  assert.equal(stageAfterBuildQuote("work_order"), "work_order");
});
