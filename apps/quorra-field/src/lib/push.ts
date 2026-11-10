import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

const STORED = "qd-push-token";
let listening = false;

function openLink(link: unknown) {
  if (typeof link !== "string" || !link.startsWith("/")) return;
  if (import.meta.env.VITE_HASH_ROUTER) location.hash = `#${link}`;
  else location.assign(link);
}

/** Listen before the first paint so a tap that launched the app is not missed. Native only. */
export function listenForPush(): void {
  if (listening || !Capacitor.isNativePlatform()) return;
  listening = true;
  void PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    openLink(action.notification.data?.link);
  });
  void PushNotifications.addListener("registration", (token) => {
    try { localStorage.setItem(STORED, token.value); } catch { /* ignore */ }
    void saveToken(token.value);
  });
  void PushNotifications.addListener("registrationError", (err) => {
    console.error("push registration", err);
  });
}

async function saveToken(token: string) {
  if (!supabase) return;
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") return;
  const { error } = await supabase.rpc("register_device_token", { p_token: token, p_platform: platform });
  if (error) console.error("save push token", error.message);
}

/** Ask for permission and register. No-op in the browser. */
export async function enablePush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !supabase) return;
  listenForPush();
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
}

/** Drop this phone's token. Call while the session is still valid. */
export async function disablePush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !supabase) return;
  let token = "";
  try { token = localStorage.getItem(STORED) ?? ""; } catch { /* ignore */ }
  if (token) {
    const { error } = await supabase.from("device_tokens").delete().eq("token", token);
    if (error) console.error("remove push token", error.message);
  }
  try { localStorage.removeItem(STORED); } catch { /* ignore */ }
}
