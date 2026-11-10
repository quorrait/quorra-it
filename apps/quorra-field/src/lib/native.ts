import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/** Login stays dark. The signed-in app bar is white, so its status-bar icons are dark (Style.Light). */
export async function applyStatusBar(tone: "app" | "login"): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const darkText = tone === "app";
  const color = darkText ? "#ffffff" : "#0f1720";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
  await StatusBar.setStyle({ style: darkText ? Style.Light : Style.Dark }).catch(() => undefined);
  await StatusBar.setBackgroundColor({ color }).catch(() => undefined);
}

/** Drop the native splash. The first screen is the dark login, so the status bar starts there. */
export async function prepareNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => undefined);
  await applyStatusBar("login");
}

/** iOS does not resize the web view for the keyboard, so a focused field can sit underneath it. */
export function keepInputsVisible(): void {
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select")) return;
    window.setTimeout(() => target.scrollIntoView({ block: "center", inline: "nearest" }), 280);
  });
}
