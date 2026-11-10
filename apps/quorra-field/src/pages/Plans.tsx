import { useNavigate } from "react-router-dom";
import PlanCards from "../components/PlanCards";
import BuyService from "../components/BuyService";
import { isIosApp } from "../lib/iosPlan";

/** Public page: what each plan includes. Picking one starts account creation. */
export default function Plans() {
  const nav = useNavigate();
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
    <div className="pub">
      <div className="pub-wrap">
        {import.meta.env.BASE_URL !== "./" && <a className="small muted" href="/dispatch/">‹ Back to website</a>}
        <div className="pub-head">
          <img src={`${import.meta.env.BASE_URL}logo-wide-v2.png`} alt="Quorra Dispatch" />
          <button className="btn" onClick={() => nav("/")}>Sign in</button>
        </div>
        <h1>Pick your plan</h1>
        <p className="sub">Try any plan free for 14 days. Create your account, add a card, and start dispatching. Nothing is charged until the trial ends. Cancel any time.</p>
        <PlanCards onChoose={(p, iv) => nav(`/start?plan=${p.id}&interval=${iv}`)} cta="Start" />
      </div>
    </div>
  );
}
