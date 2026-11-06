-- Quorra Dispatch: fake test data for ONE account. Safe to run in the Supabase SQL editor.
-- 1) Sign up in the app first. 2) Put that email below. 3) Run. Re-running replaces the test data.
do $$
declare
  v_email text := 'you@example.com';  -- <== CHANGE THIS to the email you signed up with
  o uuid;
  c uuid[] := '{}'; j uuid[] := '{}'; i uuid; k uuid; e uuid;
  n int;
begin
  select id into o from auth.users where lower(email) = lower(v_email);
  if o is null then raise exception 'No user with email %. Sign up in the app first.', v_email; end if;

  -- wipe this account's data so the script can be re-run
  delete from public.payments where owner_id = o;
  delete from public.time_entries where owner_id = o;
  delete from public.leads where owner_id = o;
  delete from public.estimates where owner_id = o;
  delete from public.purchase_orders where owner_id = o;
  delete from public.invoices where owner_id = o;
  delete from public.service_plans where owner_id = o;
  delete from public.jobs where owner_id = o;
  delete from public.customers where owner_id = o;
  delete from public.team_members where owner_id = o;
  delete from public.price_items where owner_id = o;

  insert into public.business (owner_id, name, phone, email, tax_rate, state)
  values (o, 'Summit Home Services (TEST)', '(916) 555-0100', v_email, 7.25, 'CA')
  on conflict (owner_id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email, tax_rate = excluded.tax_rate, state = excluded.state;

  insert into public.team_members (owner_id, name, role, phone, email, hourly_cents, commission_pct, color) values
    (o, 'Dana Reyes', 'Manager', '(916) 555-0111', 'dana@example.com', 4500, 0, '#0f2742'),
    (o, 'Marcus Lee', 'Technician', '(916) 555-0112', 'marcus@example.com', 3200, 5, '#e8590c'),
    (o, 'Priya Shah', 'Technician', '(916) 555-0113', 'priya@example.com', 3400, 5, '#137a3c');

  -- customers
  for n in 1..6 loop
    insert into public.customers (owner_id, name, phone, email, address, notes) values (o,
      (array['Wendy Ortiz','Tom & Linda Hargrove','Blue Door Bakery','Greg Nakamura','Sunrise Dental','Alicia Brooks'])[n],
      '(916) 555-02' || lpad(n::text, 2, '0'), 'customer' || n || '@example.com',
      (array['412 Oak St, Roseville','88 Maple Ct, Rocklin','1200 Main St, Lincoln','5 Vista Way, Granite Bay','300 Sunset Blvd, Roseville','77 Pine Ln, Loomis'])[n] || ' CA',
      case when n = 3 then 'Rear entrance for deliveries' else '' end) returning id into i;
    c := c || i;
  end loop;

  -- jobs: past (completed) and upcoming (scheduled), spread over about 6 weeks
  for n in 1..12 loop
    insert into public.jobs (owner_id, customer_id, title, description, address, status, start_at, end_at, assigned_to)
    values (o, c[1 + (n % 6)],
      (array['AC repair','Water heater replacement','Drain cleaning','Panel upgrade','Furnace tune-up','Ceiling fan install','Whole-home repipe','Mini-split install','EV charger install','Toilet replacement','Seasonal HVAC inspection','Recessed lighting'])[n],
      'Test job ' || n, '', case when n <= 6 then 'completed' else 'scheduled' end,
      date_trunc('day', now()) + ((n - 7) * 3 || ' days')::interval + interval '9 hours',
      date_trunc('day', now()) + ((n - 7) * 3 || ' days')::interval + interval '11 hours 30 minutes',
      (array['Marcus Lee','Priya Shah','Dana Reyes'])[1 + (n % 3)])
    returning id into i;
    j := j || i;
  end loop;

  -- invoices for completed jobs: paid, partly paid, overdue, draft
  for n in 1..6 loop
    insert into public.invoices (owner_id, number, customer_id, job_id, status, items, tax_rate, issued_at, due_at)
    values (o, 1000 + n, c[1 + (n % 6)], j[n], case when n = 6 then 'draft' else 'sent' end,
      jsonb_build_array(jsonb_build_object('description', 'Labor', 'qty', 2 + n, 'unit_cents', 14500),
                        jsonb_build_object('description', 'Parts and materials', 'qty', 1, 'unit_cents', 8000 * n)),
      7.25, now() - ((40 - n * 6) || ' days')::interval, now() - ((26 - n * 6) || ' days')::interval)
    returning id into i;
    if n in (1, 2, 3) then
      insert into public.payments (owner_id, invoice_id, amount_cents, method, paid_at)
      select o, i, public.invoice_total_cents(v), (array['card','check','cash'])[n], now() - ((30 - n * 7) || ' days')::interval
      from public.invoices v where v.id = i;
    elsif n = 4 then
      insert into public.payments (owner_id, invoice_id, amount_cents, method, paid_at) values (o, i, 10000, 'card', now() - interval '3 days');
    end if;
  end loop;

  -- estimates in every status
  for n in 1..5 loop
    insert into public.estimates (owner_id, number, customer_id, title, status, items, tax_rate, issued_at, valid_until, notes)
    values (o, 2000 + n, c[n],
      (array['Water heater replacement','AC replacement','Panel upgrade','Mini-split install','EV charger install'])[n],
      (array['draft','sent','approved','declined','sent'])[n],
      jsonb_build_array(jsonb_build_object('description', (array['50 gal water heater, installed','3-ton AC, installed','200A panel upgrade','Ductless mini-split, 1 zone','Level 2 charger, installed'])[n], 'qty', 1,
        'unit_cents', (array[145000, 690000, 160000, 320000, 120000])[n])),
      7.25, now() - ((n * 2) || ' days')::interval, now() + interval '30 days', '1-year labor warranty. 50% deposit to schedule.');
  end loop;

  -- leads at every stage
  insert into public.leads (owner_id, name, phone, email, address, source, service, stage, notes, created_at) values
    (o, 'Rachel Kim', '(916) 555-0301', 'rachel@example.com', '9 Elm Dr, Rocklin', 'Website form', 'AC not cooling', 'new', '', now() - interval '2 hours'),
    (o, 'Omar Haddad', '(916) 555-0302', 'omar@example.com', '61 Birch Rd, Lincoln', 'Website form', 'Water heater leaking', 'new', 'Says it is urgent', now() - interval '5 hours'),
    (o, 'Jenna Cole', '(916) 555-0303', '', '17 Cedar Ct, Roseville', 'Referral', 'Panel upgrade quote', 'contacted', '', now() - interval '1 day'),
    (o, 'Sam Patel', '(916) 555-0304', 'sam@example.com', '240 Lake Dr, Granite Bay', 'Google', 'Whole-home repipe', 'send_quote', '', now() - interval '2 days'),
    (o, 'Lena Fox', '(916) 555-0305', 'lena@example.com', '5 Ridge Rd, Loomis', 'Website form', 'Furnace replacement', 'declined', 'Went with another company', now() - interval '9 days');

  -- price book, service plan, purchase order
  insert into public.price_items (owner_id, name, description, category, unit_cents, cost_cents) values
    (o, 'Service call', 'Diagnostic visit', 'Service', 8900, 0),
    (o, 'Labor, per hour', '', 'Labor', 14500, 3200),
    (o, '50 gal water heater', '', 'Equipment', 89000, 52000),
    (o, 'Ceiling fan install', '', 'Service', 18500, 0);
  insert into public.service_plans (owner_id, customer_id, name, visit_title, price_cents, interval_months, next_visit)
    values (o, c[3], 'Annual HVAC plan', 'Seasonal HVAC inspection', 24900, 6, (now() + interval '3 weeks')::date);
  insert into public.purchase_orders (owner_id, number, vendor, status, items)
    values (o, 3001, 'Ferguson', 'ordered', jsonb_build_array(jsonb_build_object('description', '50 gal water heater', 'qty', 2, 'unit_cents', 52000)));

  raise notice 'Test data loaded for %', v_email;
end $$;
