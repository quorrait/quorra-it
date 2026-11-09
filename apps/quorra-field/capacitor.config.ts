import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.quorrait.dispatch",
  appName: "Quorra Dispatch",
  webDir: "dist-app",
  backgroundColor: "#0f1720",
  ios: { contentInset: "automatic" },
  plugins: { SplashScreen: { launchAutoHide: true, launchShowDuration: 800, backgroundColor: "#0f1720" } },
};
export default config;
