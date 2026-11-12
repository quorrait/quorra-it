import { useState } from "react";
import { Icon } from "./ui";
import { parseUsAddress } from "../lib/usAddress";
import { TAP_TO_PAY_IOS_ENABLED, iosSupportsTapToPay, iosVersionFromUserAgent } from "../lib/tapToPay";
import { requestTapToPayLocation } from "../lib/terminalPay";

const REVIEWED_KEY = "qd-tap-to-pay-reviewed";

export function tapToPayReviewed(): boolean {
  try { return localStorage.getItem(REVIEWED_KEY) === "1"; } catch { return false; }
}

function rememberReviewed() {
  try { localStorage.setItem(REVIEWED_KEY, "1"); } catch { /* ignore */ }
}

/**
 * In-app education and readiness for Tap to Pay on iPhone.
 * Apple's entitlement is not requested from here, and payment stays off until TAP_TO_PAY_IOS_ENABLED.
 */
export function TapToPayOnboarding({
  stripeConnected,
  address,
  canTakePayment,
  onStart,
}: {
  stripeConnected: boolean;
  address?: string | null;
  canTakePayment: boolean;
  onStart(): void;
}) {
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState<"unknown" | "ready" | "blocked">("unknown");
  const [reviewed, setReviewed] = useState(tapToPayReviewed);
  const [locBusy, setLocBusy] = useState(false);
  const version = iosVersionFromUserAgent(typeof navigator === "undefined" ? "" : navigator.userAgent);
  const iosOk = iosSupportsTapToPay(version);
  const addressOk = Boolean(parseUsAddress(address));
  const checks = [
    { label: "iPhone XS or newer", ok: reviewed, detail: "Confirm this when you review the steps. Dispatch cannot see the phone model." },
    { label: "iOS 16.4 or later", ok: iosOk, detail: version ? `This phone is on iOS ${version.major}.${version.minor}.` : "Open this screen in the iPhone app to check the version." },
    { label: "Stripe connected", ok: stripeConnected, detail: "Connect Stripe under Integrations. Card payments go to your bank." },
    { label: "Business address", ok: addressOk, detail: "Settings needs a street, city, state, and ZIP." },
    { label: "Location allowed", ok: location === "ready", detail: "Tap to Pay on iPhone asks for location before the reader starts." },
  ];
  const ready = checks.every((c) => c.ok) && reviewed;

  async function allowLocation() {
    setLocBusy(true);
    try {
      await requestTapToPayLocation();
      setLocation("ready");
    } catch {
      setLocation("blocked");
    } finally {
      setLocBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="small muted">Step {step + 1} of 4</div>
      {step === 0 && (
        <>
          <h2 style={{ fontSize: 20 }}>Tap to Pay on iPhone</h2>
          <p className="muted" style={{ margin: 0 }}>Take a contactless card on this iPhone. The customer holds their card, or their own phone, near the top of yours. No extra card reader. The money goes to the Stripe account you connect for your business.</p>
        </>
      )}
      {step === 1 && (
        <>
          <h2 style={{ fontSize: 20 }}>How a customer pays</h2>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            <li>Open the invoice and choose Card.</li>
            <li>Choose Tap to Pay on iPhone.</li>
            <li>Have the customer hold their card on the top of this iPhone until it pays.</li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>The QR code is still there if this phone cannot take the tap.</p>
        </>
      )}
      {step === 2 && (
        <>
          <h2 style={{ fontSize: 20 }}>Is this iPhone ready?</h2>
          <div className="card flush">
            <div className="list">
              {checks.map((c) => (
                <div key={c.label} className="list-item" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="title">{c.label}</div>
                    <div className="small muted">{c.detail}</div>
                  </div>
                  <span className={`badge ${c.ok ? "good" : ""}`}>{c.ok ? "Ready" : "Needed"}</span>
                </div>
              ))}
            </div>
          </div>
          <button className="btn block" type="button" disabled={locBusy} onClick={() => void allowLocation()}>
            {locBusy ? "Asking..." : location === "ready" ? "Location allowed" : "Allow location"}
          </button>
          {location === "blocked" && <div className="error-banner" style={{ margin: 0 }}>Allow location for Dispatch in iPhone Settings, then come back.</div>}
          <label className="check-row">
            <input type="checkbox" checked={reviewed} onChange={(e) => { setReviewed(e.target.checked); if (e.target.checked) rememberReviewed(); else try { localStorage.removeItem(REVIEWED_KEY); } catch { /* ignore */ } }} />
            I have reviewed how Tap to Pay on iPhone works
          </label>
        </>
      )}
      {step === 3 && (
        <>
          <h2 style={{ fontSize: 20 }}>{TAP_TO_PAY_IOS_ENABLED ? "Ready to take a payment" : "Waiting on Apple"}</h2>
          {!TAP_TO_PAY_IOS_ENABLED && (
            <div className="notice">
              This build does not include Apple's Tap to Pay entitlement yet, so the iPhone cannot take a tap. These screens are here for you to review. After Apple approves it, a new build of Dispatch turns payment on. This screen does not submit that request.
            </div>
          )}
          {TAP_TO_PAY_IOS_ENABLED && !ready && <div className="notice">Finish the checklist on the previous step before taking a payment.</div>}
          {TAP_TO_PAY_IOS_ENABLED && ready && canTakePayment && <p className="muted" style={{ margin: 0 }}>This iPhone can take Tap to Pay on iPhone for the invoice you have open.</p>}
          <p className="small muted" style={{ margin: 0 }}>Questions: support@quorrait.com</p>
        </>
      )}
      <div className="row" style={{ gap: 8 }}>
        {step > 0 && <button className="btn" type="button" onClick={() => setStep((n) => n - 1)}>Back</button>}
        {step < 3 && <button className="btn primary grow" type="button" onClick={() => setStep((n) => n + 1)}>Next</button>}
        {step === 3 && TAP_TO_PAY_IOS_ENABLED && canTakePayment && (
          <button className="btn primary grow" type="button" disabled={!ready} onClick={() => { rememberReviewed(); onStart(); }}>{Icon.card} Take the payment</button>
        )}
      </div>
    </div>
  );
}
