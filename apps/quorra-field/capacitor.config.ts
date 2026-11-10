import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.quorrait.dispatch",
  // Home-screen name. The App Store listing name stays "Quorra Dispatch".
  appName: "Dispatch",
  webDir: "dist-app",
  backgroundColor: "#0f1720",
  ios: {
    contentInset: "never",
    backgroundColor: "#0f1720",
  },
  android: {
    backgroundColor: "#0f1720",
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
      backgroundColor: "#0f1720",
    },
  },
};
export default config;
