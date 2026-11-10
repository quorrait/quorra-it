import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.quorrait.dispatch",
  // Home-screen name. The App Store listing name stays "Quorra Dispatch".
  appName: "Dispatch",
  webDir: "dist-app",
  backgroundColor: "#ffffff",
  ios: {
    contentInset: "never",
    // The web view itself must not scroll, or iOS rubber-bands the whole page (header included).
    scrollEnabled: false,
    backgroundColor: "#ffffff",
  },
  android: {
    backgroundColor: "#ffffff",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: "#0f1720",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "LIGHT",
      backgroundColor: "#ffffff",
    },
  },
};
export default config;
