import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { keepInputsVisible, prepareNativeShell } from "./lib/native";
import { listenForPush } from "./lib/push";

const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter;
import App from "./App";
import "./styles.css";

function Root() {
  useEffect(() => { void prepareNativeShell(); }, []);
  return (
    <Router>
      <App />
    </Router>
  );
}

keepInputsVisible();
listenForPush();
void prepareNativeShell();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

// Pick up a new version without a hard refresh: when the tab is opened again, compare the live page's script with the one running.
if (import.meta.env.PROD) {
  const running = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/"]')?.getAttribute("src") ?? "";
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== "visible") return;
    checking = true;
    try {
      const html = await (await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: "no-store" })).text();
      const live = /<script[^>]+type="module"[^>]+src="([^"]*assets\/[^"]+)"/.exec(html)?.[1];
      const now = running();
      if (live && now && live.split("/").pop() !== now.split("/").pop()) {
        const regs = await navigator.serviceWorker?.getRegistrations?.();
        await Promise.all((regs ?? []).map((r) => r.update().catch(() => {})));
        location.reload();
      }
    } catch { /* offline */ } finally { checking = false; }
  };
  document.addEventListener("visibilitychange", () => void check());
  window.addEventListener("focus", () => void check());
}
