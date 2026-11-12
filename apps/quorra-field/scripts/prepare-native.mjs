// After `cap add` / asset generation, force the phone shell we actually want.
// iOS is created on the build machine; Android is in the repo and can be overwritten by @capacitor/assets.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const which = process.argv[2] ?? "all";
const runIos = which === "all" || which === "ios";
const runAndroid = which === "all" || which === "android";

const LAUNCH = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="21701" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="21679"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <viewLayoutGuide key="safeArea" id="6Tk-OE-BBY"/>
                        <color key="backgroundColor" red="0.058823529411764705" green="0.09019607843137255" blue="0.12549019607843137" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
</document>
`;

function upsertPlistString(xml, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (pattern.test(xml)) return xml.replace(pattern, `$1${value}$2`);
  return xml.replace("</dict>\n</plist>", `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`);
}

function patch(path, fn) {
  if (!existsSync(path)) {
    console.log(`skip missing ${path}`);
    return;
  }
  const next = fn(readFileSync(path, "utf8"));
  writeFileSync(path, next);
  console.log(`updated ${path}`);
}

if (runIos) {
  const ios = join(root, "ios");
  if (!existsSync(ios)) {
    console.log("no ios project yet");
  } else {
    patch(join(ios, "App/App/Info.plist"), (xml) => {
      let next = xml;
      if (next.includes("<key>CFBundleDisplayName</key>")) {
        next = next.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, "$1Dispatch$2");
      } else {
        next = next.replace("</dict>\n</plist>", "\t<key>CFBundleDisplayName</key>\n\t<string>Dispatch</string>\n</dict>\n</plist>");
      }
      next = upsertPlistString(next, "NSLocationWhenInUseUsageDescription", "Dispatch uses your location to check you in at job sites and to take a card payment with Tap to Pay on iPhone.");
      next = upsertPlistString(next, "NFCReaderUsageDescription", "Dispatch uses NFC so a customer can tap a card on this iPhone.");
      const iphoneOrient = `\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>`;
      const ipadOrient = `\t<key>UISupportedInterfaceOrientations~ipad</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>`;
      if (next.includes("<key>UISupportedInterfaceOrientations</key>")) {
        next = next.replace(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/, iphoneOrient.trim());
      }
      if (next.includes("<key>UISupportedInterfaceOrientations~ipad</key>")) {
        next = next.replace(/<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>[\s\S]*?<\/array>/, ipadOrient.trim());
      } else {
        next = next.replace("</dict>\n</plist>", `${ipadOrient}\n</dict>\n</plist>`);
      }
      if (!next.includes("<string>remote-notification</string>")) {
        if (next.includes("<key>UIBackgroundModes</key>")) {
          next = next.replace(/(<key>UIBackgroundModes<\/key>\s*<array>)/, "$1\n\t\t<string>remote-notification</string>");
        } else {
          next = next.replace("</dict>\n</plist>", "\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>\n\t</array>\n</dict>\n</plist>");
        }
      }
      return next;
    });
    const entitlements = join(ios, "App/App/App.entitlements");
    mkdirSync(dirname(entitlements), { recursive: true });
    writeFileSync(entitlements, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
`);
    console.log(`updated ${entitlements}`);
    patch(join(ios, "App/App.xcodeproj/project.pbxproj"), (text) => {
      let next = text.replace(/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/g, "IPHONEOS_DEPLOYMENT_TARGET = 15.0;");
      if (!next.includes("CODE_SIGN_ENTITLEMENTS")) {
        next = next.replace(
          /PRODUCT_BUNDLE_IDENTIFIER = com\.quorrait\.dispatch;/g,
          "PRODUCT_BUNDLE_IDENTIFIER = com.quorrait.dispatch;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
        );
      }
      next = next.replace(/PRODUCT_BUNDLE_IDENTIFIER = com\.quorrait\.dispatch;[\s\S]*?\n\t\t\t\};/g, (block) => {
        if (block.includes("TARGETED_DEVICE_FAMILY")) {
          return block.replace(/TARGETED_DEVICE_FAMILY = [^;]+;/, 'TARGETED_DEVICE_FAMILY = "1,2";');
        }
        return block.replace(/\n\t\t\t\};$/, '\n\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";\n\t\t\t};');
      });
      return next;
    });
    patch(join(ios, "App/Podfile"), (text) => text.replace(/platform :ios, '[0-9.]+'/, "platform :ios, '15.0'"));
    const storyboard = join(ios, "App/App/Base.lproj/LaunchScreen.storyboard");
    if (existsSync(storyboard)) {
      writeFileSync(storyboard, LAUNCH);
      console.log(`updated ${storyboard}`);
    }
  }
}

if (runAndroid) {
  const strings = join(root, "android/app/src/main/res/values/strings.xml");
  patch(strings, (xml) =>
    xml
      .replace(/(<string name="app_name">)[^<]*(<\/string>)/, "$1Dispatch$2")
      .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, "$1Dispatch$2"),
  );
  const styles = join(root, "android/app/src/main/res/values/styles.xml");
  if (existsSync(styles)) {
    const launch = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#0F1720</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">#0F1720</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowBackground">#0F1720</item>
        <item name="android:statusBarColor">#0F1720</item>
        <item name="android:navigationBarColor">#0F1720</item>
    </style>`;
    patch(styles, (xml) => xml.replace(/<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/, launch.trim()));
  }
}
