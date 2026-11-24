// After `cap add` / asset generation, force the phone shell we actually want.
// iOS is created on the build machine; Android is in the repo and can be overwritten by @capacitor/assets.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** App Store build number. Build 5 was rejected; the next upload must be higher. */
export const IOS_BUILD_NUMBER = 6;
/** Marketing version stays 1.0. */
export const IOS_MARKETING_VERSION = "1.0";

/**
 * Release / App Store entitlements. Apple granted Tap to Pay for development only,
 * so this file must not include com.apple.developer.proximity-reader.payment.acceptance.
 */
export const RELEASE_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
`;

/** Debug entitlements. The development Tap to Pay entitlement can live here and be turned back on later. */
export const DEBUG_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>development</string>
	<key>com.apple.developer.proximity-reader.payment.acceptance</key>
	<true/>
</dict>
</plist>
`;

/** Point Debug at the development entitlements and Release at the App Store file, and keep the version above build 5. */
export function patchIosProject(text) {
  let next = text.replace(/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/g, "IPHONEOS_DEPLOYMENT_TARGET = 15.0;");
  next = next.replace(/CURRENT_PROJECT_VERSION = (\d+);/g, (_, n) => `CURRENT_PROJECT_VERSION = ${Math.max(Number(n), IOS_BUILD_NUMBER)};`);
  next = next.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${IOS_MARKETING_VERSION};`);
  next = next.replace(/PRODUCT_BUNDLE_IDENTIFIER = com\.quorrait\.dispatch;[\s\S]*?\n\t\t\t\};\n\t\t\tname = (Debug|Release);/g, (block, name) => {
    const file = name === "Debug" ? "App/App.debug.entitlements" : "App/App.entitlements";
    let updated = block;
    if (updated.includes("CODE_SIGN_ENTITLEMENTS")) {
      updated = updated.replace(/CODE_SIGN_ENTITLEMENTS = [^;]+;/, `CODE_SIGN_ENTITLEMENTS = ${file};`);
    } else {
      updated = updated.replace(
        "PRODUCT_BUNDLE_IDENTIFIER = com.quorrait.dispatch;",
        `PRODUCT_BUNDLE_IDENTIFIER = com.quorrait.dispatch;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = ${file};`,
      );
    }
    if (updated.includes("TARGETED_DEVICE_FAMILY")) {
      updated = updated.replace(/TARGETED_DEVICE_FAMILY = [^;]+;/, 'TARGETED_DEVICE_FAMILY = "1,2";');
    } else {
      updated = updated.replace(/\n\t\t\t\};/, '\n\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";\n\t\t\t};');
    }
    return updated;
  });
  return next;
}

/** Raise a literal CFBundleVersion above 5. Variable versions ($(CURRENT_PROJECT_VERSION)) are left for the build setting. */
export function patchInfoVersions(xml) {
  let next = xml.replace(/(<key>CFBundleVersion<\/key>\s*<string>)(\d+)(<\/string>)/, (_, open, n, close) => `${open}${Math.max(Number(n), IOS_BUILD_NUMBER)}${close}`);
  next = next.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)(?!\$\()[^<]*(<\/string>)/, `$1${IOS_MARKETING_VERSION}$2`);
  return next;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
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
      // Written into the generated Info.plist. There is no Info.plist in the repo; Capacitor creates the iOS project on the build machine.
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
      return patchInfoVersions(next);
    });
    const entitlements = join(ios, "App/App/App.entitlements");
    const debugEntitlements = join(ios, "App/App/App.debug.entitlements");
    mkdirSync(dirname(entitlements), { recursive: true });
    // Release is what Codemagic's ios-release workflow archives. No Tap to Pay key.
    writeFileSync(entitlements, RELEASE_ENTITLEMENTS);
    writeFileSync(debugEntitlements, DEBUG_ENTITLEMENTS);
    console.log(`updated ${entitlements}`);
    console.log(`updated ${debugEntitlements}`);
    patch(join(ios, "App/App.xcodeproj/project.pbxproj"), patchIosProject);
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
}
