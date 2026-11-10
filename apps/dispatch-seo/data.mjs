// Content for the Quorra Dispatch SEO pages. Edit here, then run: node build.mjs
// Every trade entry carries its own pains, workflow and FAQ so pages are not near-duplicates.

export const SITE = "https://www.quorrait.com";
export const OUT_DIR = "dispatch";
export const SIGNUP = "https://quorradispatch.com/app/plans";
export const BRAND = "Quorra Dispatch";

export const PRICING = [
  { name: "Basic", price: "$80", logins: "1 login", for: "One-person shop" },
  { name: "Essentials", price: "$190", logins: "Up to 5 logins", for: "Small crew" },
  { name: "Enterprise", price: "$300", logins: "Up to 15 logins", for: "Growing company" },
];

export const TRADES = [
  {
    slug: "plumbing",
    name: "Plumbing",
    noun: "plumbers",
    title: "Field Service Software for Plumbers",
    desc: "Schedule jobs, send estimates, and get paid on the spot. Quorra Dispatch is built for plumbing companies. 14-day free trial, plans from $80/mo.",
    hero: "Run your plumbing business from your phone",
    sub: "Quote the water heater swap, text the customer you're on the way, and take the card payment before you leave the driveway.",
    pains: [
      ["Emergency calls break the schedule", "A burst pipe at 7 AM shouldn't mean calling every customer by hand. Reschedule a job and the customer is texted automatically."],
      ["Good/better/best quotes take too long", "Build estimates from your price book, with a local price guide to start from, and send them by text or portal link so customers can accept from their phone."],
      ["Unpaid invoices after the job", "Take cash, check, or card on the spot, with card payments going into your own Stripe account."],
      ["Repeat work gets forgotten", "Recurring service plans and reminders cover water heater flushes, backflow tests, and annual inspections."],
    ],
    jobs: ["Water heater replacement", "Drain cleaning", "Repipe estimates", "Backflow testing", "Fixture installs"],
    faq: [
      ["Can I send plumbing estimates from my phone?", "Yes. Estimates go out by PDF, email, text, or customer portal link, and customers can accept and book a time online."],
      ["Can I track annual backflow or water heater service?", "Yes. Recurring service plans schedule repeat visits and send reminder texts or emails."],
      ["Does it work with QuickBooks?", "QuickBooks Online sync is included on the Enterprise plan."],
    ],
  },
  {
    slug: "hvac",
    name: "HVAC",
    noun: "HVAC contractors",
    title: "HVAC Software for Service Companies",
    desc: "Scheduling, estimates, invoicing, and maintenance plans for HVAC companies. Quorra Dispatch starts at $80/mo with a 14-day free trial.",
    hero: "HVAC scheduling and invoicing that keeps up with summer",
    sub: "Dispatch techs, send quotes for the new system, and put every customer on a maintenance plan without a spreadsheet.",
    pains: [
      ["Peak-season chaos", "A calendar tied to jobs, with phone calendar sync, shows who is where. Customers get texts when a visit moves."],
      ["Maintenance agreements fall through", "Recurring service plans create the next visit and remind the customer before it happens."],
      ["Big-ticket quotes go cold", "Send an estimate with a portal link. Customers accept online and pick a time to book the install."],
      ["Techs and hours are hard to track", "Timesheets with overtime, edit history, and custom pay periods, plus labor cost reports on Enterprise."],
    ],
    jobs: ["System replacement quotes", "Spring and fall tune-ups", "Maintenance plans", "Furnace repair", "Mini-split installs"],
    faq: [
      ["Can I run HVAC maintenance plans?", "Yes. Set up recurring service plans and the app schedules the visits and sends reminders."],
      ["Can customers book online?", "After accepting a quote, customers can choose an open time online."],
      ["How many technicians can use it?", "Basic has 1 login, Essentials 5, and Enterprise 15. Larger crews get a Custom plan."],
    ],
  },
  {
    slug: "electrical",
    name: "Electrical",
    noun: "electricians",
    title: "Electrician Software: Quotes, Scheduling & Invoices",
    desc: "Electrical contractor software for estimates, scheduling, purchase orders, and payments. Try Quorra Dispatch free for 14 days.",
    hero: "Software for electricians who would rather be on the job",
    sub: "Price panel upgrades and rewires from your price book, order materials with purchase orders, and invoice from the truck.",
    pains: [
      ["Material costs eat the margin", "Keep a price book and use purchase orders with preset vendors so material orders are tracked per job."],
      ["Quotes sit in the inbox", "Customers accept estimates from a link on their phone, no printing or signing paper."],
      ["Permit and inspection jobs overlap", "A job calendar with phone sync keeps rough-in, inspection, and finish visits in order."],
      ["Chasing payment on larger jobs", "Send invoices by email, text, or portal link and take card payments right from the phone."],
    ],
    jobs: ["Panel upgrades", "EV charger installs", "Rewires", "Lighting retrofits", "Troubleshooting calls"],
    faq: [
      ["Can I track material purchases?", "Yes. Purchase orders let you save vendors and tie orders to jobs."],
      ["Can I import my customer list?", "Yes. CSV imports are supported, and Enterprise includes data import help."],
      ["Do customers need an account to pay?", "No. They use a link or the customer portal to view quotes and invoices and pay."],
    ],
  },
  {
    slug: "roofing",
    name: "Roofing",
    noun: "roofers",
    title: "Roofing Contractor Software",
    desc: "Estimates, lead tracking, scheduling, and payments for roofing companies. Quorra Dispatch: 14-day free trial, from $80/mo.",
    hero: "Win more roofing bids and get paid faster",
    sub: "Capture leads from your website, send the estimate the same day, and collect deposits and final payments by card.",
    pains: [
      ["Leads come from everywhere", "A website lead form feeds a lead pipeline, so storm-season inquiries don't get lost."],
      ["Slow estimates lose the job", "Send a quote by text or link the same day. Customers accept online."],
      ["Weather moves everything", "Reschedule a job and the customer is texted automatically. The crew calendar updates with it."],
      ["Deposits and final payments", "Take card, check, or cash and keep every invoice and payment on one customer record."],
    ],
    jobs: ["Roof replacement estimates", "Repair visits", "Inspections", "Gutter work", "Storm damage leads"],
    faq: [
      ["Can I add a lead form to my website?", "Yes. The app includes a website lead form, and Enterprise lets you design your own."],
      ["Can I send estimates with deposits?", "You can send estimates and invoices and collect card, check, or cash payments. Set your own payment terms."],
      ["Does it work on a phone?", "Yes. Quorra Dispatch is a mobile-first web app that works on a phone with no app store install."],
    ],
  },
  {
    slug: "landscaping",
    name: "Landscaping",
    noun: "landscapers",
    title: "Landscaping Business Software",
    desc: "Recurring service scheduling, estimates, and card payments for landscaping and lawn care. Quorra Dispatch from $80/mo, 14-day free trial.",
    hero: "Recurring routes and easy payments for landscapers",
    sub: "Put weekly mowing and seasonal cleanups on recurring service plans, and let customers pay from a link.",
    pains: [
      ["Recurring jobs live in your head", "Recurring service plans create each visit and send reminders, so routes stay predictable."],
      ["Rain delays", "Move a visit and the customer gets a text. No call-backs."],
      ["One-off projects need real quotes", "Send estimates for patios, planting, and irrigation with a portal link for acceptance."],
      ["Small invoices add up to a lot of chasing", "Customers pay by card from a link, QR code, Apple Pay, or Google Pay."],
    ],
    jobs: ["Weekly mowing", "Seasonal cleanups", "Irrigation repair", "Planting projects", "Hardscape quotes"],
    faq: [
      ["Can I schedule weekly or monthly visits?", "Yes, with recurring service plans."],
      ["Can my crew see their jobs?", "Each team member gets their own login with roles. Essentials includes up to 5 logins."],
      ["Is there a long contract?", "Plans bill monthly, with 10% off if you pay annually. You can cancel from your account."],
    ],
  },
  {
    slug: "general-contractors",
    name: "General Contractors",
    noun: "general contractors",
    title: "Software for General Contractors and Remodelers",
    desc: "Estimates, job tracking, purchase orders, and invoicing for general contractors. Quorra Dispatch: 14-day free trial.",
    hero: "Keep remodel jobs, quotes, and payments in one place",
    sub: "Track each job from lead to estimate to invoice, with purchase orders, timesheets, and a customer portal.",
    pains: [
      ["Many jobs, many subs", "A job calendar and customer records keep each project's visits and notes together."],
      ["Change orders and paperwork", "Estimates and invoices go out as PDF, email, text, or portal link, so customers always see the latest."],
      ["Labor and material costs", "Timesheets, purchase orders, and labor cost tracking show what a job really costs."],
      ["Customers asking for status", "The customer portal shows quotes and invoices, so fewer 'where are we?' calls."],
    ],
    jobs: ["Kitchen and bath remodels", "Additions", "Punch lists", "Deck builds", "Small repairs"],
    faq: [
      ["Can I track labor on each job?", "Timesheets with overtime and custom pay periods are included, and Enterprise adds labor cost reports."],
      ["Can I order materials through it?", "You can create purchase orders with saved vendors."],
      ["Is it good for a small crew?", "Yes. Basic is one login at $80/mo and Essentials gives a 5-person crew their own logins at $190/mo."],
    ],
  },
];

// Competitor comparison pages. Only statements about Quorra Dispatch are made as fact.
// Do not add competitor prices or features here unless they have been checked on the competitor's site that day.
export const COMPETITORS = [
  { slug: "housecall-pro-alternative", name: "Housecall Pro" },
  { slug: "fieldpulse-alternative", name: "FieldPulse" },
  { slug: "jobber-alternative", name: "Jobber" },
  { slug: "servicetitan-alternative", name: "ServiceTitan" },
];

export const COMPETITOR_ANGLES = {
  "housecall-pro-alternative": "If you've looked at Housecall Pro and want something simpler and more affordable for a small shop, here is how Quorra Dispatch is set up.",
  "fieldpulse-alternative": "If FieldPulse looks like more than your company needs, Quorra Dispatch covers the daily work of scheduling, quoting, and getting paid in one simple app.",
  "jobber-alternative": "Jobber is popular with small service businesses. Quorra Dispatch is built for contractors and field crews, with flat pricing based on how many people sign in.",
  "servicetitan-alternative": "ServiceTitan is built for large operations. If you run a small to mid-size crew and want a quick setup, Quorra Dispatch is a lighter option.",
};

export const WHY = [
  ["Flat pricing by logins", "Pick a plan by how many people need to sign in. Plans are $80, $190, or $300 a month, with 10% off when paid annually."],
  ["Phone-first, no app store", "Works in your phone's browser and can be added to your home screen."],
  ["Get paid on the spot", "Cash, check, or card, with card payments going into your own Stripe account."],
  ["Local, human support", "Built and supported by Quorra IT in Northern California, with email support on every plan and phone support on Enterprise."],
  ["14-day free trial, 10% off annual", "Try it with your own jobs. Pay annually and save 10%."],
];
