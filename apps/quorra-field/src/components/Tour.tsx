import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useData } from "../lib/app";
import type { Feature } from "../lib/access";

interface Step { to: string; f?: Feature; title: string; text: string }
const STEPS: Step[] = [
  { to: "/", title: "Welcome to Quorra Dispatch", text: "This is your home screen. It shows what you earned today, this week and this month, plus your calendar. Here is a 1 minute tour." },
  { to: "/leads", f: "leads", title: "Leads", text: "New requests from your website form land here. Move each one forward: contact, quote, accept, schedule." },
  { to: "/estimates", f: "estimates", title: "Estimates", text: "Build a quote from your price book and send it by link, email or text. Customers accept it and pick their own time." },
  { to: "/jobs", f: "jobs", title: "Jobs", text: "Every scheduled visit lives here. Assign your crew, track the work and send on-my-way texts." },
  { to: "/invoices", f: "invoices", title: "Invoices and payments", text: "Turn a finished job into an invoice and take card, cash or check. Card payments go straight to your Stripe account." },
  { to: "/integrations", f: "settings", title: "Integrations", text: "Connect QuickBooks and Stripe here so invoices and payments sync on their own." },
  { to: "/settings", f: "settings", title: "Settings", text: "Add your logo and details, choose your invoice and email style, and set the hours customers can book." },
  { to: "/support", title: "Support", text: "Stuck or have an idea? Send us a message from the Support page, any time." },
];

const key = (email: string | null) => `qd_tour_done:${email ?? "anon"}`;
export const resetTour = (email: string | null) => { try { localStorage.removeItem(key(email)); } catch { /* ignore */ } };

/** First-time tour: walks a new user through the main screens. Skip tour ends it for good. */
export default function Tour() {
  const { email } = useAuth();
  const { can, loading, locked } = useData();
  const nav = useNavigate();
  const [i, setI] = useState(-1);
  const steps = STEPS.filter((s) => !s.f || can(s.f));

  useEffect(() => {
    if (loading || locked || !email) return;
    let done = false;
    try { done = localStorage.getItem(key(email)) === "1"; } catch { /* ignore */ }
    if (!done) setI(0);
    const again = () => setI(0);
    window.addEventListener("qd-tour", again);
    return () => window.removeEventListener("qd-tour", again);
  }, [loading, locked, email]);

  if (i < 0 || !steps[i]) return null;
  const s = steps[i];
  const last = i === steps.length - 1;
  const end = () => { try { localStorage.setItem(key(email), "1"); } catch { /* ignore */ } setI(-1); nav("/"); };
  const go = (n: number) => { setI(n); nav(steps[n].to); };
  return (
    <div className="tour" role="dialog" aria-label="App tour">
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
  );
}
