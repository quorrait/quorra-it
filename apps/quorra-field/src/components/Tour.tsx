import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useData } from "../lib/app";
import type { Feature } from "../lib/access";
import { setTourTab } from "../lib/tourBus";

interface Step { to: string; f?: Feature; owner?: boolean; tab?: string; chip?: string; title: string; text: string }
const STEPS: Step[] = [
  { to: "/", title: "Welcome to Quorra Dispatch", text: "This is your home screen: what you earned today, this week and this month, plus your calendar. Here is a quick tour." },
  { to: "/leads", f: "leads", title: "Leads", text: "New requests from your website form land here. Move each one forward: contact, quote, accept, schedule." },
  { to: "/estimates", f: "estimates", title: "Estimates", text: "Build a quote from your price book and send it by link, email or text. Customers accept it and pick their own time." },
  { to: "/jobs", f: "jobs", title: "Jobs", text: "Every scheduled visit lives here. Assign your crew, track the work and send on-my-way texts." },
  { to: "/invoices", f: "invoices", title: "Invoices and payments", text: "Turn a finished job into an invoice and take card, cash or check. Card payments go straight to your Stripe account." },
  { to: "/integrations", f: "settings", title: "Integrations", text: "Connect QuickBooks and Stripe so invoices and payments sync on their own." },
  { to: "/settings", f: "settings", tab: "business", chip: "Business", title: "Settings: Business", text: "Your business name, logo, phone, address and tax rate. They show on every estimate, invoice and email." },
  { to: "/settings", f: "settings", tab: "documents", chip: "Documents", title: "Settings: Documents", text: "Pick your invoice layout, turn the name or logo on and off, set where invoice numbers start, and choose your website lead form." },
  { to: "/settings", f: "settings", tab: "emails", chip: "Emails", title: "Settings: Emails", text: "Choose how your emails look and edit the wording for reminders, quotes, invoices and nudges. They are sent as your business, with a live preview." },
  { to: "/settings", f: "settings", tab: "schedule", chip: "Schedule and alerts", title: "Settings: Schedule and alerts", text: "Set the hours customers can book, including open 24/7, and how long before a visit you and your customer get reminders." },
  { to: "/settings", f: "settings", owner: true, tab: "access", chip: "Access", title: "Settings: Access", text: "Choose what each role can see, so your crew only gets the screens they need." },
  { to: "/settings", f: "settings", tab: "account", chip: "Account", title: "Settings: Account", text: "Your login, password and security. You can retake this tour any time from Support." },
  { to: "/support", title: "Support", text: "Stuck or have an idea? Send us a message from the Support page, any time." },
];

const key = (email: string | null) => `qd_tour_done:${email ?? "anon"}`;
export const resetTour = (email: string | null) => { try { localStorage.removeItem(key(email)); } catch { /* ignore */ } };

const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getBoundingClientRect().width > 0;
function findTarget(s: Step): HTMLElement | null {
  if (s.chip) {
    const c = Array.from(document.querySelectorAll<HTMLElement>(".chips .chip")).find((x) => x.textContent?.trim().startsWith(s.chip!));
    if (visible(c ?? null)) return c!;
  }
  const side = document.querySelector(`.side a[href$="#${s.to}"]`);
  if (visible(side)) return side;
  const tab = document.querySelector(`.tabbar a[href$="#${s.to}"]`);
  if (visible(tab)) return tab;
  const more = document.querySelector('.tabbar a[href$="#/more"]');
  return visible(more) ? more : null;
}

/** First-time tour: dims the screen, points at the menu item or tab being explained, and walks through the app. */
export default function Tour() {
  const { email } = useAuth();
  const { can, me, loading, locked } = useData();
  const nav = useNavigate();
  const [i, setI] = useState(-1);
  const [box, setBox] = useState<DOMRect | null>(null);
  const steps = STEPS.filter((s) => (!s.f || can(s.f)) && (!s.owner || me.isOwner));

  useEffect(() => {
    if (loading || locked || !email) return;
    let done = false;
    try { done = localStorage.getItem(key(email)) === "1"; } catch { /* ignore */ }
    if (!done) setI(0);
    const again = () => { nav("/"); setI(0); };
    window.addEventListener("qd-tour", again);
    return () => window.removeEventListener("qd-tour", again);
  }, [loading, locked, email]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const title = steps[i]?.title ?? "";
  const measure = useCallback(() => {
    const s = stepsRef.current.find((x) => x.title === title);
    const el = s ? findTarget(s) : null;
    const r = el ? el.getBoundingClientRect() : null;
    setBox((old) => (old && r && old.left === r.left && old.top === r.top && old.width === r.width && old.height === r.height ? old : r));
  }, [title]);
  useLayoutEffect(() => {
    measure();
    const t1 = setTimeout(measure, 120), t2 = setTimeout(measure, 450);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", measure); };
  }, [measure]);

  if (i < 0 || !steps[i]) return null;
  const s = steps[i];
  const last = i === steps.length - 1;
  const end = () => { try { localStorage.setItem(key(email), "1"); } catch { /* ignore */ } setTourTab(null); setI(-1); nav("/"); };
  const go = (n: number) => { const t = steps[n]; setI(n); nav(t.to); setTourTab(t.tab ?? null); };
  const desktop = typeof window !== "undefined" && window.innerWidth >= 900;
  const style: React.CSSProperties = {};
  if (desktop && box) {
    if (box.left < 300) { style.left = box.right + 18; style.top = Math.max(16, Math.min(box.top - 8, window.innerHeight - 230)); style.right = "auto"; style.bottom = "auto"; }
    else { style.left = Math.max(16, Math.min(box.left, window.innerWidth - 400)); style.top = box.bottom + 16; style.right = "auto"; style.bottom = "auto"; }
  }
  return (
    <>
      <div className="tour-block" />
      {box && <div className="tour-ring" style={{ left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }} />}
      {!box && <div className="tour-dim" />}
      <div className="tour" style={style} role="dialog" aria-label="App tour">
        <div className="tour-dots" aria-hidden="true">{steps.map((_, n) => <i key={n} className={n === i ? "on" : ""} />)}</div>
        <b>{s.title}</b>
        <p>{s.text}</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={end}>Skip tour</button>
          <span className="grow" />
          {i > 0 && <button className="btn sm" onClick={() => go(i - 1)}>Back</button>}
          <button className="btn sm primary" onClick={() => (last ? end() : go(i + 1))}>{last ? "Finish" : i === 0 ? "Start tour" : "Next"}</button>
        </div>
      </div>
    </>
  );
}
