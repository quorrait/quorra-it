import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "../src/lib/csv.ts";
import { ENTITIES, isJobberClientExport, mapJobberClientRow } from "../src/lib/importers.ts";

// Header row from Jobber's published client export sample:
// https://help.getjobber.com/help-center/files/41010131815447/jobber-clients-sample-file.csv
const HEADER = "Client Created Date,Client Is Company?,Client Title,Client First Name,Client Last Name,Client Full Name (Display Only),Client Company Name,Client Email,Client Main Phone,Client Home Phone,Client Work Phone,Client Mobile Phone,Client Fax Phone,Client Other Phone,Client SMS Enabled Phone Number,Property Street 1,Property Street 2,Property City,Property State/Province,Property Zip/Postal Code,Property Country,Billing Street 1,Billing Street 2,Billing City,Billing State/Province,Billing Zip/Postal Code,Billing Country,Client Receives Auto Visit Reminders? (True/False),Client Receives Auto Job Follow-ups? (True/False),Client Receives Auto Quote Follow-ups? (True/False),Client Receives Auto Invoice Follow-ups? (True/False),Archived (True/False),Account Balance,Client Internal Notes,Lead Source,Tags";

function row(values: Record<string, string>): string[] {
  const headers = HEADER.split(",");
  return headers.map((h) => values[h] ?? "");
}

test("Jobber client export headers are recognized and a generic CSV is not", () => {
  const [headers] = parseCsv(HEADER);
  assert.equal(headers.length, 36);
  assert.equal(isJobberClientExport(headers), true);
  assert.equal(isJobberClientExport(["Name", "Phone", "Email", "Address", "Notes"]), false);
});

test("a Jobber company client maps name, phone, email, and property address", () => {
  const headers = HEADER.split(",");
  const cells = row({
    "Client Is Company?": "TRUE",
    "Client First Name": "Jason",
    "Client Last Name": "Example",
    "Client Full Name (Display Only)": "Jason Example",
    "Client Company Name": "Example Ltd",
    "Client Email": "JasonExample@example.com, billing@example.com",
    "Client Main Phone": "800-555-0100",
    "Client Home Phone": "\n",
    "Client Work Phone": "800-555-0165",
    "Property Street 1": "10520 Ave NW",
    "Property Street 2": "111",
    "Property City": "Edmonton",
    "Property State/Province": "Alberta",
    "Property Zip/Postal Code": "T5G 0B6",
    "Property Country": "Canada",
    "Billing Street 1": "11660 Ave NW",
    "Client Internal Notes": "The key is under the mat!",
    "Lead Source": "Google",
    "Tags": "Summer 2026, Recurring, Lawnmowing",
    "Archived (True/False)": "FALSE",
  });
  const mapped = mapJobberClientRow(headers, cells);
  assert.equal(mapped.name, "Example Ltd (Jason Example)");
  assert.equal(mapped.phone, "800-555-0100");
  assert.equal(mapped.email, "JasonExample@example.com");
  assert.equal(mapped.address, "10520 Ave NW, 111, Edmonton, Alberta T5G 0B6, Canada");
  assert.equal(mapped.notes, "The key is under the mat!\nLead source: Google\nTags: Summer 2026, Recurring, Lawnmowing");
  const customers = ENTITIES.find((e) => e.key === "customers");
  assert.ok(customers);
  const built = customers.build(mapped, { customers: [], invoices: [], jobs: [], store: {} as never });
  assert.equal("error" in built, false);
});

test("a Jobber person client uses the person's name and marks archived rows", () => {
  const headers = HEADER.split(",");
  const cells = row({
    "Client Is Company?": "FALSE",
    "Client Title": "Mr",
    "Client First Name": "Jason",
    "Client Last Name": "Test",
    "Client Full Name (Display Only)": "Jason Test",
    "Client Email": "Jason@example.com",
    "Client Main Phone": "800-555-0111",
    "Client Mobile Phone": "800-555-0199",
    "Property Street 1": "8132 Ave NW",
    "Property City": "Edmonton",
    "Property State/Province": "Alberta",
    "Property Zip/Postal Code": "T5B 4W4",
    "Property Country": "Canada",
    "Client Internal Notes": "Loves Formula 1",
    "Lead Source": "Flyer",
    "Archived (True/False)": "TRUE",
  });
  const mapped = mapJobberClientRow(headers, cells);
  assert.equal(mapped.name, "Jason Test");
  assert.equal(mapped.phone, "800-555-0111");
  assert.equal(mapped.email, "Jason@example.com");
  assert.equal(mapped.address, "8132 Ave NW, Edmonton, Alberta T5B 4W4, Canada");
  assert.match(mapped.notes, /^Archived in Jobber\./);
  assert.match(mapped.notes, /Loves Formula 1/);
});
