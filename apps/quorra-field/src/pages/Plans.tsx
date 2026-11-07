import { useNavigate } from "react-router-dom";
import PlanCards from "../components/PlanCards";

/** Public page: what each plan includes. Picking one starts account creation. */
export default function Plans() {
  const nav = useNavigate();
  return (
    <div className="pub">
      <div className="pub-wrap">
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
