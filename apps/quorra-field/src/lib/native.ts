import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/** Drop the native splash and draw the web view under the status bar. Safe to call more than once. */
export async function prepareNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => undefined);
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
  await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  await StatusBar.setBackgroundColor({ color: "#0f1720" }).catch(() => undefined);
}

/** iOS does not resize the web view for the keyboard, so a focused field can sit underneath it. */
export function keepInputsVisible(): void {
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select")) return;
    window.setTimeout(() => target.scrollIntoView({ block: "center", inline: "nearest" }), 280);
  });
}
