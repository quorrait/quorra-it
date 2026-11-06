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
        <p className="sub">One price per business. Create your account, pay securely with Stripe, and start dispatching. Cancel any time.</p>
        <PlanCards onChoose={(p) => nav(`/start?plan=${p.id}`)} cta="Get" />
      </div>
    </div>
  );
}
