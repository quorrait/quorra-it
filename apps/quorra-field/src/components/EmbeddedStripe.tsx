import { useEffect, useRef, useState } from "react";

type StripeEmbed = { mount(el: HTMLElement): void; destroy(): void };
declare global { interface Window { Stripe?: (pk: string) => { initEmbeddedCheckout(o: { clientSecret: string; onComplete?: () => void }): Promise<StripeEmbed> } } }

function loadStripe(): Promise<void> {
  if (window.Stripe) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Could not load the secure payment form. Check your connection."));
    document.head.appendChild(s);
  });
}

/** Stripe's secure payment form shown inside our own page (card entry itself stays on Stripe for security). */
export default function EmbeddedStripe({ publishableKey, clientSecret, onComplete }: { publishableKey: string; clientSecret: string; onComplete(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(onComplete);
  done.current = onComplete;
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let embed: StripeEmbed | null = null;
    let dead = false;
    loadStripe()
      .then(async () => {
        const stripe = window.Stripe!(publishableKey);
        embed = await stripe.initEmbeddedCheckout({ clientSecret, onComplete: () => done.current() });
        if (dead) { embed.destroy(); return; }
        if (box.current) embed.mount(box.current);
        setReady(true);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the payment form"));
    return () => { dead = true; try { embed?.destroy(); } catch { /* ignore */ } };
  }, [publishableKey, clientSecret]);
  return (
    <div>
      {!ready && !err && <div className="small muted" style={{ padding: 16, textAlign: "center" }}>Loading secure form...</div>}
      {err && <div className="error-banner">{err}</div>}
      <div ref={box} />
      <div className="small muted" style={{ textAlign: "center", marginTop: 8 }}>Payments are processed securely by Stripe. We never see or store your card number.</div>
    </div>
  );
}
