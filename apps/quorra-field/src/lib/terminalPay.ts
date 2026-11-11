import { StripeTerminal, TerminalConnectTypes, TerminalEventsEnum } from "@capacitor-community/stripe-terminal";
import { demoMode, supabase } from "./supabase";
import { tapToPayMessage } from "./tapToPay";

async function callTerminal<T>(fn: string, body: object): Promise<T> {
  if (!supabase) throw new Error("Tap to Pay needs a live Stripe account. Use the QR code in the demo.");
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let m = "";
    try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).error ?? ""; } catch { /* ignore */ }
    throw new Error(m || error.message || "Tap to Pay didn't go through. Try again, or use the QR code.");
  }
  if (data && typeof data === "object" && "error" in data && data.error) throw new Error(String(data.error));
  return data as T;
}

/** Discover the phone's Tap to Pay reader, take the invoice amount, then disconnect. */
export async function collectTapToPay(invoiceId: string, onStatus?: (message: string) => void): Promise<void> {
  if (demoMode || !supabase) throw new Error("Tap to Pay needs a live Stripe account. Use the QR code in the demo.");
  const say = (m: string) => onStatus?.(m);
  const tokenWait = StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
    const fresh = await callTerminal<{ secret: string }>("terminal-connection-token", {});
    await StripeTerminal.setConnectionToken({ token: fresh.secret });
  });
  try {
    say("Getting Tap to Pay ready...");
    const boot = await callTerminal<{ secret: string; location_id: string }>("terminal-connection-token", {});
    await StripeTerminal.initialize({ isTest: false });
    say("Looking for this phone...");
    const { readers } = await StripeTerminal.discoverReaders({
      type: TerminalConnectTypes.TapToPay,
      locationId: boot.location_id,
    });
    const reader = readers?.[0];
    if (!reader) throw new Error("This phone can't take Tap to Pay.");
    await StripeTerminal.connectReader({ reader });
    say("Hold the card on the back of the phone.");
    const intent = await callTerminal<{ client_secret: string }>("terminal-payment-intent", { invoice_id: invoiceId });
    await StripeTerminal.collectPaymentMethod({ paymentIntent: intent.client_secret });
    await StripeTerminal.confirmPaymentIntent();
    say("Payment received.");
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    throw new Error(tapToPayMessage(raw));
  } finally {
    (await tokenWait).remove();
    await StripeTerminal.disconnectReader().catch(() => undefined);
  }
}
