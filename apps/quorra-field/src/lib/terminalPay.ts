import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { StripeTerminal, TerminalConnectTypes, TerminalEventsEnum } from "@capacitor-community/stripe-terminal";
import { demoMode, supabase } from "./supabase";
import { tapToPayMessage } from "./tapToPay";

const SIMULATED = import.meta.env?.VITE_TERMINAL_SIMULATED === "1";

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

let tokenListener: PluginListenerHandle | null = null;
let booted: Promise<void> | null = null;
let progressListener: PluginListenerHandle | null = null;

async function ensureTokenListener() {
  if (tokenListener) return;
  tokenListener = await StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
    const fresh = await callTerminal<{ secret: string }>("terminal-connection-token", {});
    await StripeTerminal.setConnectionToken({ token: fresh.secret });
  });
}

/** Initialize once per app run. Later payments reuse this Terminal and its token provider. */
export async function ensureTerminal(): Promise<void> {
  await ensureTokenListener();
  if (typeof document !== "undefined" && !(globalThis as { __tapBg?: boolean }).__tapBg) {
    (globalThis as { __tapBg?: boolean }).__tapBg = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void disconnectTap();
    });
  }
  if (!booted) {
    booted = StripeTerminal.initialize({ isTest: SIMULATED }).catch((e) => {
      booted = null;
      throw e;
    });
  }
  await booted;
}

export function onReaderProgress(cb: (progress: number) => void): () => void {
  let stop = false;
  void StripeTerminal.addListener(TerminalEventsEnum.ReaderSoftwareUpdateProgress, (ev: { progress?: number }) => {
    if (!stop && typeof ev?.progress === "number") cb(ev.progress);
  }).then((handle) => { progressListener = handle; });
  return () => { stop = true; void progressListener?.remove(); progressListener = null; };
}

export async function locationAllowed(): Promise<boolean> {
  const terminal = StripeTerminal as unknown as {
    checkPermissions?: () => Promise<{ location?: string }>;
    requestPermissions?: () => Promise<{ location?: string }>;
  };
  try {
    const current = await terminal.checkPermissions?.();
    if (current?.location === "granted") return true;
    const asked = await terminal.requestPermissions?.();
    if (!asked) return true;
    return asked.location === "granted";
  } catch {
    return false;
  }
}

export function openAppSettings(): void {
  const platform = Capacitor.getPlatform();
  if (platform === "ios") window.open("app-settings:");
  else window.open("intent://settings#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;end");
}

export async function cancelTap(): Promise<void> {
  await StripeTerminal.cancelCollectPaymentMethod().catch(() => undefined);
  await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
}

export async function disconnectTap(): Promise<void> {
  await StripeTerminal.disconnectReader().catch(() => undefined);
}

async function discoverPhone(locationId: string) {
  const found = StripeTerminal.discoverReaders({ type: TerminalConnectTypes.TapToPay, locationId });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("This phone can't take Tap to Pay.")), 20_000));
  try {
    return await Promise.race([found, timer]);
  } catch (e) {
    await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
    throw e;
  }
}

/** Discover the phone's Tap to Pay reader and take the invoice amount. The reader stays connected for the next tap. */
export async function collectTapToPay(invoiceId: string, businessName: string, onStatus?: (message: string) => void): Promise<string> {
  if (demoMode || !supabase) throw new Error("Tap to Pay needs a live Stripe account. Use the QR code in the demo.");
  const say = (m: string) => onStatus?.(m);
  if (!(await locationAllowed())) throw new Error("Allow location in Settings");
  try {
    say("Getting Tap to Pay ready...");
    const boot = await callTerminal<{ secret: string; location_id: string }>("terminal-connection-token", {});
    await ensureTerminal();
    say("Looking for this phone...");
    const { readers } = await discoverPhone(boot.location_id);
    const reader = readers?.[0];
    if (!reader) throw new Error("This phone can't take Tap to Pay.");
    await StripeTerminal.connectReader({
      reader,
      merchantDisplayName: businessName || "Quorra Dispatch",
      autoReconnectOnUnexpectedDisconnect: true,
    });
    say("Hold the card on the back of the phone.");
    const intent = await callTerminal<{ id: string; client_secret: string }>("terminal-payment-intent", { invoice_id: invoiceId });
    await StripeTerminal.collectPaymentMethod({ paymentIntent: intent.client_secret });
    await StripeTerminal.confirmPaymentIntent();
    say("Payment received.");
    const started = Date.now();
    while (Date.now() - started < 15_000) {
      const row = await callTerminal<{ paid?: boolean }>("terminal-payment-intent", { action: "confirm", invoice_id: invoiceId, payment_intent_id: intent.id });
      if (row.paid) return intent.id;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return intent.id;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    throw new Error(tapToPayMessage(raw));
  }
}
