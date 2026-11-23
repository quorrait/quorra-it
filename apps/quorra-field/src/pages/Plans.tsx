import { useNavigate, useSearchParams } from "react-router-dom";
import PlanCards from "../components/PlanCards";
import BuyService from "../components/BuyService";
import { isIosApp } from "../lib/iosPlan";
import { PUBLIC_SITE_URL } from "../lib/publicUrl";
import { AgreeLine } from "../components/LegalNotice";

/** Public page: what each plan includes. Picking one starts account creation. */
export default function Plans() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const focus = params.get("plan") ?? undefined;
  const initialInterval = params.get("interval") === "year" ? "year" as const : "month" as const;
  if (isIosApp()) {
    return (
      <div className="pub">
        <div className="pub-wrap">
          <div className="pub-head">
            <img src={`${import.meta.env.BASE_URL}logo-wide-v2.png`} alt="Quorra Dispatch" />
            <button className="btn" onClick={() => nav("/")}>Sign in</button>
          </div>
          <h1>Buy service</h1>
          <p className="sub">Quorra Dispatch plans are sold on the website, not in the iOS app.</p>
          <BuyService />
        </div>
      </div>
    );
  }
  return (
    <div className="plans-screen">
      <div className="pub-wrap">
        {import.meta.env.BASE_URL !== "./" && <a className="small muted" href={PUBLIC_SITE_URL}>‹ Back to website</a>}
        <div className="pub-head">
          <img src={`${import.meta.env.BASE_URL}logo-wide-v2.png`} alt="Quorra Dispatch" />
          <button className="btn" onClick={() => nav("/")}>Sign in</button>
        </div>
        <h1>Pick your plan</h1>
        <p className="sub">Try any plan free for 14 days. A card is required, and nothing is charged if you cancel before the trial ends. Pay monthly and get 50% off your first 3 months, or pay yearly and save 10%.</p>
        <PlanCards focus={focus} initialInterval={initialInterval} onChoose={(p, iv) => nav(`/start?plan=${p.id}&interval=${iv}`)} cta="Start" />
        <AgreeLine />
      </div>
    </div>
  );
}
